import { env } from "cloudflare:test"
import { describe, expect, it } from "vitest"
import { drizzle } from "drizzle-orm/d1"
import { and, eq } from "drizzle-orm"
import * as schema from "../../src/db/schema"
import type { Bindings } from "../../src/types"
import { runNotificationJob } from "../../src/api/notify-queue"
import { clearOutbox, readOutbox, DEFAULT_BULK_FROM, DEFAULT_FROM } from "../../src/mail/mailer"
import { actorFor, api, post, signIn } from "./helpers"

/**
 * The email channel, end to end: the address a sign-in proved becomes the
 * reader's EMAIL channel, the switch is theirs, and a notification they
 * turned on reaches them with an HTML part and a way out. Until 2026-09-09
 * the transport, the copy and the headers existed and no real person had a
 * channel row, so every email the app could render went to nobody.
 */
const db = () => drizzle(env.DB, { schema })
const SPECTATOR = actorFor("SPECTATOR")

async function whoami(cookie: string): Promise<string> {
  const res = await api("/api/auth/get-session", { cookie })
  const body = (await res.json()) as { user?: { id?: string } }
  expect(body.user?.id).toBeTruthy()
  return body.user!.id!
}

const emailRows = (userId: string) =>
  db()
    .select({
      address: schema.userNotificationChannel.address,
      label: schema.userNotificationChannel.addressLabel,
      enabled: schema.userNotificationChannel.isEnabled,
      verifiedAt: schema.userNotificationChannel.verifiedAt,
    })
    .from(schema.userNotificationChannel)
    .where(
      and(eq(schema.userNotificationChannel.userId, userId), eq(schema.userNotificationChannel.channelCode, "EMAIL")),
    )

describe("The verified address becomes the EMAIL channel", () => {
  it("registers the address on sign-in, enabled and verified", async () => {
    const cookie = await signIn(SPECTATOR)
    const rows = await emailRows(await whoami(cookie))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ address: SPECTATOR, label: "primary", enabled: true })
    expect(rows[0]!.verifiedAt).toBeTruthy()
  })

  it("an old address goes when the sign-in address differs from it", async () => {
    const cookie = await signIn(SPECTATOR)
    const userId = await whoami(cookie)
    await db()
      .delete(schema.userNotificationChannel)
      .where(and(eq(schema.userNotificationChannel.userId, userId), eq(schema.userNotificationChannel.channelCode, "EMAIL")))
    await db().insert(schema.userNotificationChannel).values({
      userId,
      channelCode: "EMAIL",
      address: "old-address@example.invalid",
      addressLabel: "primary",
      secret: null,
      localeCode: "en",
      isEnabled: true,
      verifiedAt: new Date().toISOString(),
    })

    await signIn(SPECTATOR)

    const rows = await emailRows(userId)
    expect(rows.map((r) => r.address)).toEqual([SPECTATOR])
  })

  it("the sign-in mail itself carries an HTML part, the transactional sender and no unsubscribe header", async () => {
    clearOutbox()
    await post("/api/auth/email-otp/send-verification-otp", { email: SPECTATOR, type: "sign-in" })
    const mail = readOutbox(SPECTATOR)[0]
    expect(mail, "no sign-in mail captured").toBeTruthy()
    expect(mail!.html).toContain("<!DOCTYPE")
    expect(mail!.html).toContain("<h1")
    expect(mail!.from).toBe(DEFAULT_FROM)
    expect(mail!.headers["List-Unsubscribe"]).toBeUndefined()
    expect(mail!.html).not.toContain("<a ")
  })
})

describe("EMAIL preferences through the API", () => {
  it("turns email on for one type, reports it beside the push mutes, and names the address", async () => {
    const cookie = await signIn(SPECTATOR)
    const put = await api("/api/notification-preferences", {
      method: "PUT",
      body: JSON.stringify({ notificationTypeCode: "EVENT_REMINDER", channelCode: "EMAIL", isEnabled: true }),
      cookie,
    })
    expect(put.status).toBe(200)

    const mine = await api("/api/follow", { cookie })
    const body = (await mine.json()) as { muted: string[]; emailOn: string[]; email: { address: string; verified: boolean } | null }
    expect(body.emailOn).toContain("EVENT_REMINDER")
    // Push is untouched by an email switch: opt-out there, opt-in here.
    expect(body.muted).not.toContain("EVENT_REMINDER")
    expect(body.email).toEqual({ address: SPECTATOR, verified: true })

    const off = await api("/api/notification-preferences", {
      method: "PUT",
      body: JSON.stringify({ notificationTypeCode: "EVENT_REMINDER", channelCode: "EMAIL", isEnabled: false }),
      cookie,
    })
    expect(off.status).toBe(200)
    const after = (await (await api("/api/follow", { cookie })).json()) as { emailOn: string[] }
    expect(after.emailOn).not.toContain("EVENT_REMINDER")
  })

  it("a caller that names no channel still means push", async () => {
    const cookie = await signIn(SPECTATOR)
    await api("/api/notification-preferences", {
      method: "PUT",
      body: JSON.stringify({ notificationTypeCode: "ROSTER_CHANGE", isEnabled: false }),
      cookie,
    })
    const body = (await (await api("/api/follow", { cookie })).json()) as { muted: string[]; emailOn: string[] }
    expect(body.muted).toContain("ROSTER_CHANGE")
    expect(body.emailOn).not.toContain("ROSTER_CHANGE")
    await api("/api/notification-preferences", {
      method: "PUT",
      body: JSON.stringify({ notificationTypeCode: "ROSTER_CHANGE", isEnabled: true }),
      cookie,
    })
  })
})

describe("One real email", () => {
  it("reaches a signed-in reader who turned email on: HTML part, bulk sender, a way out in header and body", async () => {
    const cookie = await signIn(SPECTATOR)
    const userId = await whoami(cookie)
    await post("/api/follow", { objectTypeCode: "TEAM", objectId: "team_001" }, cookie)
    await api("/api/notification-preferences", {
      method: "PUT",
      body: JSON.stringify({ notificationTypeCode: "SCORE_UPDATE", channelCode: "EMAIL", isEnabled: true }),
      cookie,
    })
    clearOutbox()

    // gam_002: team_001 at home, live, 41–38. The job the queue carries.
    const outcome = await runNotificationJob(db(), env as unknown as Bindings, {
      kind: "game",
      typeCode: "SCORE_UPDATE",
      gameId: "gam_002",
      actorId: "nobody",
      occurredAt: new Date().toISOString(),
      offset: 0,
    })
    expect(outcome.done).toBe(true)

    const inbox = readOutbox(SPECTATOR)
    expect(inbox, "the opted-in reader got no email").toHaveLength(1)
    const mail = inbox[0]!
    expect(mail.from).toBe(DEFAULT_BULK_FROM)
    expect(mail.headers["List-Unsubscribe"]).toMatch(/^<https?:\/\/.+\/api\/unsubscribe\?t=.+>$/)
    expect(mail.html).toContain("<!DOCTYPE")
    expect(mail.html).toContain("/#/game/gam_002")
    expect(mail.html).toMatch(/href="https?:\/\/[^"]+\/api\/unsubscribe\?t=[^"]+"/)
    expect(mail.body).toContain("/api/unsubscribe?t=")

    // Leave the fixtures as found: the switch off again, the follow gone.
    await api("/api/notification-preferences", {
      method: "PUT",
      body: JSON.stringify({ notificationTypeCode: "SCORE_UPDATE", channelCode: "EMAIL", isEnabled: false }),
      cookie,
    })
    await api("/api/follow", { method: "DELETE", body: JSON.stringify({ objectTypeCode: "TEAM", objectId: "team_001" }), cookie })
    expect((await emailRows(userId)).map((r) => r.address)).toEqual([SPECTATOR])
  })
})
