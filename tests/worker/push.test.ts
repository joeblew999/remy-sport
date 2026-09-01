/**
 * Web Push, proved rather than assumed.
 *
 * The test that would have been easy here is "assert `fetch` was called". It
 * would pass against a sender that posts garbage: every part of Web Push that
 * can be silently wrong is *inside* the body — an ECDH agreement against the
 * wrong key, an HKDF with the wrong info string, a nonce derived from the wrong
 * salt. All of those produce a well-formed POST that no browser can read, and a
 * push service accepts them without complaint because it cannot decrypt them
 * either. The failure surfaces as "notifications just don't arrive".
 *
 * So this decrypts. `receive()` below is the browser's half of RFC 8291,
 * written against the spec rather than against our sender, and every assertion
 * about what a reader sees goes through it. If the encryption is wrong these
 * tests throw; they cannot pass with an unreadable payload.
 *
 * The audience rules are asserted the same way — by reading the text that came
 * out the far end, per device, in that device's language.
 */

import { env } from "cloudflare:test"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { drizzle } from "drizzle-orm/d1"
import { and, eq } from "drizzle-orm"
import * as schema from "../../src/db/schema"
import { notify } from "../../src/api/push"
import { runNotificationJob, handleNotification, CHUNK } from "../../src/api/notify-queue"
import type { Bindings } from "../../src/types"
import { actorFor, api, post, signIn } from "./helpers"
import { SEED_ENTITIES } from "../../src/domain/model/entities"
import { teamsCoachedBy } from "../helpers/fixtures"
import { recorder, type Point } from "../helpers/track-env"
import { readOutbox, clearOutbox } from "../../src/mail/mailer"
import { unsubscribeToken } from "../../src/api/unsubscribe"

const b64url = {
  encode: (bytes: ArrayBuffer | Uint8Array) =>
    btoa(String.fromCharCode(...new Uint8Array(bytes)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, ""),
  decode: (s: string) => {
    const padded = s.padEnd(s.length + ((4 - (s.length % 4)) % 4), "=")
    const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"))
    return Uint8Array.from(raw, (c) => c.charCodeAt(0))
  },
}

const utf8 = (s: string) => new TextEncoder().encode(s)

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/** One HKDF expansion to `length` bytes, which is all RFC 8291 ever needs. */
async function hkdf(
  ikm: Uint8Array<ArrayBuffer>,
  salt: Uint8Array<ArrayBuffer>,
  info: Uint8Array<ArrayBuffer>,
  length: number,
) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"])
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8),
  )
}

/** A browser subscribing: an ECDH keypair and 16 random bytes of auth secret. */
async function subscriber(endpoint: string) {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ])
  const publicBytes = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey))
  const authSecret = crypto.getRandomValues(new Uint8Array(16))

  return {
    endpoint,
    privateKey: pair.privateKey,
    publicBytes,
    authSecret,
    subscription: {
      endpoint,
      expirationTime: null,
      keys: { p256dh: b64url.encode(publicBytes), auth: b64url.encode(authSecret) },
    },
  }
}

type Subscriber = Awaited<ReturnType<typeof subscriber>>

/**
 * The receiving half of RFC 8291 + RFC 8188 — what the browser does before it
 * hands a payload to the service worker.
 *
 * Body layout is `salt(16) || rs(4) || idlen(1) || serverPublicKey(65) || ct`.
 */
async function receive(sub: Subscriber, body: ArrayBuffer): Promise<unknown> {
  const bytes = new Uint8Array(body)
  const salt = bytes.subarray(0, 16)
  const idLength = bytes[20]!
  const serverPublicBytes = bytes.subarray(21, 21 + idLength)
  const ciphertext = bytes.subarray(21 + idLength)

  const serverKey = await crypto.subtle.importKey(
    "raw",
    serverPublicBytes,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  )
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: serverKey }, sub.privateKey, 256),
  )

  // The key-derivation info that binds the secret to *both* public keys. Get
  // the order of the two keys wrong here and everything still runs, producing
  // a plausible key that decrypts nothing.
  const ikm = await hkdf(
    shared,
    sub.authSecret,
    concat(utf8("WebPush: info\0"), sub.publicBytes, serverPublicBytes),
    32,
  )
  const cek = await hkdf(ikm, salt, utf8("Content-Encoding: aes128gcm\0"), 16)
  const nonce = await hkdf(ikm, salt, utf8("Content-Encoding: nonce\0"), 12)

  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"])
  const plain = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, ciphertext),
  )

  // Records are padded and end with a delimiter byte — 2 for the last record.
  let end = plain.length
  while (end > 0 && plain[end - 1] === 0) end -= 1
  return JSON.parse(new TextDecoder().decode(plain.subarray(0, end - 1)))
}

/** Every push the sender attempted, with its endpoint and raw body. */
type Captured = { endpoint: string; headers: Headers; body: ArrayBuffer }

const realFetch = globalThis.fetch
let captured: Captured[] = []
/** Endpoints that should answer 410, as a dead subscription would. */
let goneEndpoints = new Set<string>()

beforeEach(() => {
  captured = []
  goneEndpoints = new Set()
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    if (url.startsWith("https://push.test/")) {
      captured.push({
        endpoint: url,
        headers: new Headers(init?.headers as HeadersInit),
        // Copied here, not kept by reference: the runtime may take ownership of
        // a body ArrayBuffer once the request is dispatched, and reading it
        // afterwards then yields zeroes — which surfaces as "invalid point
        // encoding" from the key import, several layers away from the cause.
        body: (init?.body as ArrayBuffer).slice(0),
      })
      return new Response(null, { status: goneEndpoints.has(url) ? 410 : 201 })
    }
    return realFetch(input as RequestInfo, init)
  }) as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
})

const db = () => drizzle(env.DB, { schema })

/** A user row, made directly — this file is about delivery, not about sign-in. */
async function makeUser(id: string) {
  await db()
    .insert(schema.user)
    .values({
      id,
      name: id,
      email: `${id}@remy.test`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing()
  return id
}

async function follows(userId: string, objectTypeCode: "TEAM" | "EVENT" | "GAME", objectId: string) {
  await db()
    .insert(schema.subscription)
    .values({ userId, objectTypeCode, objectId, subscribedAt: new Date().toISOString() })
    .onConflictDoNothing()
}

async function registerDevice(userId: string, sub: Subscriber, locale: string) {
  await db()
    .insert(schema.userNotificationChannel)
    .values({
      userId,
      channelCode: "PUSH",
      // Three columns now, not one JSON blob: the endpoint is the row's
      // identity and has to be queryable.
      address: sub.endpoint,
      secret: JSON.stringify(sub.subscription.keys),
      localeCode: locale,
      addressLabel: `${userId}-${locale}`,
      isEnabled: true,
      verifiedAt: new Date().toISOString(),
    })
    .onConflictDoNothing()
}

const send = (targets: Parameters<typeof notify>[2]["targets"], extra = {}) =>
  notify(db(), env as unknown as Parameters<typeof notify>[1], {
    typeCode: "SCORE_UPDATE",
    targets,
    tag: "score:g1",
    render: {
      PUSH: (locale: string, tag: string) => ({
        channel: "PUSH" as const,
        title: `T-${locale}`,
        body: `B-${locale}`,
        url: "#/games/g1",
        tag,
      }),
    },
    ...extra,
  })

describe("Web Push delivery", () => {
  it("encrypts a payload the subscribing browser can actually read", async () => {
    const user = await makeUser("push-reader")
    const device = await subscriber("https://push.test/reader")
    await registerDevice(user, device, "en")
    await follows(user, "TEAM", "team-1")

    const result = await send([{ objectTypeCode: "TEAM", objectId: "team-1" }])

    expect(result.sent).toBe(1)
    expect(captured).toHaveLength(1)

    // The proof: the browser's own key opens it. A sender that agreed on the
    // wrong secret, or derived the nonce from the wrong salt, throws here.
    const payload = await receive(device, captured[0]!.body)
    expect(payload).toEqual({
      title: "T-en",
      body: "B-en",
      url: "#/games/g1",
      tag: "score:g1",
    })
  })

  it("signs with VAPID and declares the encoding the browser expects", async () => {
    const user = await makeUser("push-headers")
    const device = await subscriber("https://push.test/headers")
    await registerDevice(user, device, "en")
    // A TEAM, not a GAME: the model has no RECEIVE_GAME_NOTIFICATIONS and no
    // FOLLOWER_GAME relation, so a game reaches people through its two teams
    // and its event — which is exactly what `announce` passes.
    await follows(user, "TEAM", "team_002")

    await send([{ objectTypeCode: "TEAM", objectId: "team_002" }])

    const { headers } = captured[0]!
    // `vapid t=<jwt>, k=<public key>` — without the scheme the push service
    // returns 401 and nothing is delivered.
    expect(headers.get("authorization")).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/)
    expect(headers.get("content-encoding")).toBe("aes128gcm")
    // The collapse key, so a later score replaces this card rather than
    // stacking a second one beside it.
    expect(headers.get("topic")).toBe("score:g1")
  })

  it("sends each device in the language that device subscribed in", async () => {
    const user = await makeUser("push-bilingual")
    const phone = await subscriber("https://push.test/phone-th")
    const laptop = await subscriber("https://push.test/laptop-en")
    await registerDevice(user, phone, "th")
    await registerDevice(user, laptop, "en")
    await follows(user, "TEAM", "team-2")

    await send([{ objectTypeCode: "TEAM", objectId: "team-2" }])

    expect(captured).toHaveLength(2)
    const byEndpoint = new Map(captured.map((c) => [c.endpoint, c]))
    const thai = await receive(phone, byEndpoint.get(phone.endpoint)!.body)
    const english = await receive(laptop, byEndpoint.get(laptop.endpoint)!.body)

    // One person, two devices, two languages — which is why the locale is
    // stored per device and not on the user.
    expect((thai as { title: string }).title).toBe("T-th")
    expect((english as { title: string }).title).toBe("T-en")
  })

  it("notifies someone following the event, not only the game", async () => {
    const user = await makeUser("push-event-follower")
    const device = await subscriber("https://push.test/event")
    await registerDevice(user, device, "en")
    await follows(user, "EVENT", "event-1")

    const result = await send([
      { objectTypeCode: "GAME", objectId: "game-x" },
      { objectTypeCode: "EVENT", objectId: "event-1" },
    ])
    expect(result.sent).toBe(1)
  })

  it("wakes a reader once when they follow both the team and the event", async () => {
    const user = await makeUser("push-double")
    const device = await subscriber("https://push.test/double")
    await registerDevice(user, device, "en")
    await follows(user, "TEAM", "team-3")
    await follows(user, "EVENT", "event-3")

    await send([
      { objectTypeCode: "TEAM", objectId: "team-3" },
      { objectTypeCode: "EVENT", objectId: "event-3" },
    ])

    // Two matching rows, one phone in a pocket.
    expect(captured).toHaveLength(1)
  })

  it("says nothing to the person who entered the score", async () => {
    const actor = await makeUser("push-actor")
    const device = await subscriber("https://push.test/actor")
    await registerDevice(actor, device, "en")
    await follows(actor, "TEAM", "team-4")

    const result = await send([{ objectTypeCode: "TEAM", objectId: "team-4" }], { exclude: actor })
    expect(result.sent).toBe(0)
    expect(captured).toHaveLength(0)
  })

  it("respects a mute for that type, and only that type", async () => {
    const user = await makeUser("push-muted")
    const device = await subscriber("https://push.test/muted")
    await registerDevice(user, device, "en")
    await follows(user, "TEAM", "team-5")
    await db().insert(schema.userNotificationPreference).values({
      userId: user,
      notificationTypeCode: "SCORE_UPDATE",
      channelCode: "PUSH",
      isEnabled: false,
    })

    const muted = await send([{ objectTypeCode: "TEAM", objectId: "team-5" }])
    expect(muted.sent).toBe(0)

    // The final whistle is a different type and still gets through — a mute is
    // per type, not a blanket off switch.
    const other = await notify(db(), env, {
      typeCode: "MATCH_END",
      targets: [{ objectTypeCode: "TEAM", objectId: "team-5" }],
      tag: "status:g5",
      render: {
        PUSH: (_l: string, tag: string) => ({
          channel: "PUSH" as const, title: "final", body: "", url: "#/", tag,
        }),
      },
    })
    expect(other.sent).toBe(1)
  })

  it("sends nothing to someone who follows nothing", async () => {
    const user = await makeUser("push-unfollowed")
    const device = await subscriber("https://push.test/unfollowed")
    await registerDevice(user, device, "en")

    const result = await send([{ objectTypeCode: "TEAM", objectId: "team-6" }])
    expect(result.sent).toBe(0)
  })

  it("forgets a device the push service reports as gone", async () => {
    const user = await makeUser("push-gone")
    const device = await subscriber("https://push.test/gone")
    await registerDevice(user, device, "en")
    await follows(user, "TEAM", "team-7")
    goneEndpoints.add(device.endpoint)

    const result = await send([{ objectTypeCode: "TEAM", objectId: "team-7" }])
    expect(result.gone).toBe(1)

    // 410 means the subscription is permanently dead. Left in place it would be
    // retried on every score for the life of the row.
    const left = await db()
      .select()
      .from(schema.userNotificationChannel)
      .where(eq(schema.userNotificationChannel.userId, user))
    expect(left).toHaveLength(0)
  })

  /**
   * The whole path, in the two halves it now has.
   *
   * Delivery moved onto a queue, so entering a score no longer sends anything
   * synchronously — that is the entire point of the change, and the first
   * assertion here is the regression guard for it: a coach tapping "+2" must
   * not wait on one HTTP round trip per follower.
   *
   * The second half drives `runNotificationJob` — the consumer's logic as a
   * plain function, which is why it is a plain function — and keeps every
   * assertion the end-to-end version made: the payload is decrypted, and the
   * score, the route and the collapse tag are read out of it. What is no longer
   * proved here is that the mutation calls the *queue*, because the worker tier
   * binds none; `announce` early-returns without one, which is deliberate so a
   * score still saves.
   */
  it("does not deliver on the request path, and delivers from the job", async () => {
    const cookie = await signIn(actorFor("ORGANIZER"))

    // A game in an event this organiser actually runs. `canSetStatus` is the
    // server's own answer, so picking on it cannot drift from the model — the
    // first attempt took games[0] and got a 403 the moment the fixtures grew
    // past one event.
    const games = await api("/api/games", { cookie })
    const { games: all } = (await games.json()) as {
      games: { id: string; homeTeamId: string; canSetStatus: boolean }[]
    }
    const game = all.find((g) => g.canSetStatus)!
    expect(game, "no game this organiser may set the status of").toBeTruthy()

    const fan = await makeUser("push-e2e-fan")
    const device = await subscriber("https://push.test/e2e")
    await registerDevice(fan, device, "en")
    await follows(fan, "TEAM", game.homeTeamId)

    // Live first: a score entered on a game that is not being played is a
    // records correction, and deliberately silent.
    await api(`/api/games/${game.id}/status`, {
      method: "PUT",
      body: JSON.stringify({ id: game.id, statusCode: "LIVE" }),
      cookie,
    })
    captured = []

    const res = await api(`/api/games/${game.id}/score`, {
      method: "PUT",
      body: JSON.stringify({ id: game.id, homeScore: 61, awayScore: 58 }),
      cookie,
    })
    expect(res.status).toBe(200)

    /**
     * Nothing went out on the request path.
     *
     * Filtered to this device, which is what makes it deterministic: the queue
     * binding is live in this tier, so miniflare delivers *other* tests'
     * enqueued messages whenever it gets round to it, and an unfiltered count
     * here was picking those up.
     *
     * Immediate rather than polled, and that is the assertion: one fetch per
     * recipient used to happen inside the mutation, bounded by the Workers
     * subrequest limit. Now the mutation returns having sent nothing.
     */
    const scoreTo = (c: Captured) =>
      c.endpoint === device.endpoint && c.headers.get("topic") === `score:${game.id}`
    expect(
      captured.filter(scoreTo),
      "the score mutation must not deliver push on the request path",
    ).toHaveLength(0)

    // And the job the queue carries does the work.
    const outcome = await runNotificationJob(db(), env as unknown as Bindings, {
      kind: "game",
      typeCode: "SCORE_UPDATE",
      gameId: game.id,
      // The organiser entered the score, so they are excluded; the fan is not.
      actorId: "usr_org_001",
      occurredAt: new Date().toISOString(),
      offset: 0,
    })
    expect(outcome.sent, "the job notified nobody").toBeGreaterThanOrEqual(1)

    /**
     * By topic, not just by endpoint.
     *
     * Setting the game LIVE above enqueues MATCH_START, whose audience is this
     * same fan — and the queue is live in this tier, so that push lands on this
     * device whenever miniflare gets to it. Filtering only by endpoint made this
     * pass alone and fail in the full run, where there is more elapsed time for
     * the consumer to run. `score:` is this test's subject; `status:` is not.
     */
    const mine = captured.find(scoreTo)!
    expect(mine, "the consumer delivered no score push to this device").toBeTruthy()
    const payload = (await receive(device, mine.body)) as {
      title: string
      url: string
      tag: string
    }
    // The score is in the title, so it is readable on a lock screen without
    // opening anything.
    expect(payload.title).toContain("61")
    expect(payload.title).toContain("58")
    expect(payload.url).toBe(`#/games/${game.id}`)
    expect(payload.tag).toBe(`score:${game.id}`)
  })

  it("stays quiet when a score is corrected after the game is over", async () => {
    const cookie = await signIn(actorFor("ORGANIZER"))
    const games = await api("/api/games", { cookie })
    const { games: all } = (await games.json()) as {
      games: { id: string; homeTeamId: string; canSetStatus: boolean }[]
    }
    const theirs = all.filter((g) => g.canSetStatus)
    const game = theirs[1] ?? theirs[0]!

    const fan = await makeUser("push-e2e-quiet")
    const device = await subscriber("https://push.test/e2e-quiet")
    await registerDevice(fan, device, "en")
    await follows(fan, "TEAM", game.homeTeamId)

    await api(`/api/games/${game.id}/status`, {
      method: "PUT",
      body: JSON.stringify({ id: game.id, statusCode: "FINISHED" }),
      cookie,
    })
    captured = []

    await api(`/api/games/${game.id}/score`, {
      method: "PUT",
      body: JSON.stringify({ id: game.id, homeScore: 70, awayScore: 70 }),
      cookie,
    })

    /**
     * Fixing a typo in last week's result must not wake anyone at midnight.
     *
     * Asserted by tag rather than by count, because delivery is asynchronous
     * now: the status changes above enqueue, and miniflare runs the consumer
     * whenever it gets round to it — which can be after the reset. A count is
     * therefore a race, and it was one.
     *
     * The tag is not. A score announcement carries `score:<gameId>` and a
     * status change carries `status:<gameId>`, so "no score push went out" is
     * exactly what this test means and is true regardless of timing.
     */
    const scorePushes = captured.filter((c) => c.headers.get("topic")?.startsWith("score:"))
    expect(scorePushes, "a correction on a finished game must announce nothing").toHaveLength(0)
  })

  it("sends a test notification to my devices whether or not I follow anything", async () => {
    const cookie = await signIn(actorFor("SPECTATOR"))
    const device = await subscriber("https://push.test/self-test")

    // Registered through the API so this exercises the same path a phone does.
    await api("/api/push/subscribe", {
      method: "POST",
      body: JSON.stringify({ subscription: device.subscription, label: "Test device" }),
      cookie,
    })
    captured = []

    const res = await api("/api/push/test", {
      method: "POST",
      body: JSON.stringify({ locale: "en" }),
      cookie,
    })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { sent: number }).sent).toBe(1)

    // Following nothing and muting nothing: the button answers "can this device
    // be reached", so it must not go through the filters that might be the
    // reason a reader is pressing it.
    const payload = (await receive(device, captured[0]!.body)) as { title: string; tag: string }
    expect(payload.title).toBeTruthy()
    expect(payload.tag).toBe("test")
  })

  /**
   * The bug this whole audience rewrite exists for.
   *
   * A head coach is not a follower — they never press Follow on the team they
   * coach, because it is theirs. The first version selected from `subscription`
   * and so told them nothing about their own game, while the PO's model had
   * granted RECEIVE_TEAM_NOTIFICATIONS to HEAD_COACH all along.
   */
  it("tells a team's coach about their own game, with no Follow anywhere", async () => {
    const wichai = SEED_ENTITIES.users.find((u) => u.email === actorFor("COACH"))!
    const [coached] = teamsCoachedBy(wichai.id)
    const device = await subscriber("https://push.test/head-coach")
    await registerDevice(wichai.id, device, "en")

    // Deliberately no `follows(...)` call: the relation is the coaching, and
    // asserting it without one is the whole point.
    await send([{ objectTypeCode: "TEAM", objectId: coached! }])

    // Their endpoint specifically — the team has followers and players too, and
    // a total would pass while the coach was the one left out.
    const mine = captured.find((c) => c.endpoint === device.endpoint)
    expect(mine, "a head coach heard nothing about their own team").toBeTruthy()
    const payload = (await receive(device, mine!.body)) as { title: string }
    expect(payload.title).toBeTruthy()
  })

  it("tells an event's organiser, who also never follows their own event", async () => {
    const organiser = SEED_ENTITIES.users.find((u) => u.email === actorFor("ORGANIZER"))!
    const owned = SEED_ENTITIES.events.find((e) => e.organizerUserId === organiser.id)!
    const device = await subscriber("https://push.test/organiser")
    await registerDevice(organiser.id, device, "en")

    await send([{ objectTypeCode: "EVENT", objectId: owned.id }])
    expect(
      captured.some((c) => c.endpoint === device.endpoint),
      "an organiser heard nothing about their own event",
    ).toBe(true)
  })

  it("keeps a device when the push service merely fails", async () => {
    const user = await makeUser("push-flaky")
    const device = await subscriber("https://push.test/flaky")
    await registerDevice(user, device, "en")
    await follows(user, "TEAM", "team-8")

    // A 500 is the push service having a bad day, not the reader uninstalling.
    globalThis.fetch = (async () => new Response(null, { status: 500 })) as unknown as typeof fetch
    const result = await send([{ objectTypeCode: "TEAM", objectId: "team-8" }])

    expect(result.sent).toBe(0)
    expect(result.gone).toBe(0)
    const left = await db()
      .select()
      .from(schema.userNotificationChannel)
      .where(eq(schema.userNotificationChannel.userId, user))
    expect(left).toHaveLength(1)
  })
})

describe("A guardian hears about their own child", () => {
  /**
   * `RECEIVE_PLAYER_NOTIFICATIONS` is granted to GUARDIAN and, until roster
   * changes started announcing, a guardian received nothing about their child
   * ever: they are not a follower of the team, not a coach and not on the
   * squad, so every audience the system computed excluded them. The model had
   * said for months that a parent should hear about their own child and no code
   * had asked.
   *
   * This is the whole point of `notify` taking targets rather than a team —
   * "who follows this team" and "who is responsible for this player" are
   * different questions that overlap only by accident.
   *
   * **Asserted on endpoints, not on `sent`.** `isolatedStorage` is per file, so
   * a guardianship created by one test here is still in the database for the
   * next one; a count is therefore the sum of everything the file has set up so
   * far. The first version of these asserted counts and failed for exactly that
   * reason, which reads as a privacy bug and is not one. Who received it is the
   * real question anyway.
   */
  async function makePlayer(id: string) {
    await db()
      .insert(schema.player)
      .values({
        id,
        userId: null,
        jerseyNumber: 1,
        positionCode: "PG",
        dob: "2010-01-01",
        names: { en: "Child" },
      })
      .onConflictDoNothing()
  }

  async function guards(userId: string, playerId: string) {
    await db()
      .insert(schema.guardian)
      .values({ userId, playerId, guardianTypeCode: "PARENT" })
      .onConflictDoNothing()
  }

  const reached = () => captured.map((c) => c.endpoint)

  it("reaches a guardian who follows nothing and coaches nobody", async () => {
    const parent = await makeUser("push-guardian")
    const device = await subscriber("https://push.test/guardian")
    await registerDevice(parent, device, "en")
    await makePlayer("child-a")
    await guards(parent, "child-a")
    // Deliberately no `follows(...)`: the guardianship is the only relation,
    // and before this every audience the system computed excluded them.

    await send([{ objectTypeCode: "PLAYER", objectId: "child-a" }])
    expect(reached(), "a guardian is the player's audience").toContain(
      "https://push.test/guardian",
    )
  })

  it("does not reach somebody who is guardian to a different child", async () => {
    const other = await makeUser("push-other-guardian")
    const device = await subscriber("https://push.test/other-guardian")
    await registerDevice(other, device, "en")
    await makePlayer("child-b")
    await guards(other, "child-b")

    await send([{ objectTypeCode: "PLAYER", objectId: "child-a" }])
    expect(reached()).not.toContain("https://push.test/other-guardian")
  })

  it("sends one notification to a coach who is also the parent", async () => {
    // Two targets, one person. `notify` unions the audiences — without that a
    // parent who follows the team gets the same card twice.
    const both = await makeUser("push-coach-parent")
    const device = await subscriber("https://push.test/coach-parent")
    await registerDevice(both, device, "en")
    await makePlayer("child-c")
    await guards(both, "child-c")
    await follows(both, "TEAM", "team-both")

    await send([
      { objectTypeCode: "TEAM", objectId: "team-both" },
      { objectTypeCode: "PLAYER", objectId: "child-c" },
    ])
    expect(reached().filter((e) => e === "https://push.test/coach-parent")).toHaveLength(1)
  })
})

/**
 * What a send batch reports about itself.
 *
 * `push.sent` has recorded one row per attempt for a while, and it cannot see
 * two things. It is written *after* `fetch` returns, so a request that throws —
 * DNS, refused, a service that is down — writes nothing at all: a total outage
 * of one push service produced zero telemetry, which reads exactly like sending
 * nothing. And it does not separate "this subscription is dead" from "this send
 * failed", which need opposite responses.
 *
 * These drive the real `notify` against a stubbed push service, because the
 * accounting only exists inside `deliver` and the counts are what matter.
 */
describe("Send telemetry", () => {
  /**
   * Vendor hostnames, answered locally.
   *
   * The file's own stub only intercepts `https://push.test/`, and these
   * endpoints have to carry real vendor hostnames because the service label is
   * the thing under test. Anything not intercepted here reaches the outer stub,
   * which is what keeps the rest of the file working.
   */
  let status = new Map<string, number>()
  let throws = new Set<string>()
  beforeEach(() => {
    status = new Map()
    throws = new Set()
    const outer = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
      if (/(apple|googleapis|mozilla)\.com/.test(url)) {
        if (throws.has(url)) throw new TypeError("Network connection lost")
        return new Response(null, { status: status.get(url) ?? 201 })
      }
      return outer(input as RequestInfo, init)
    }) as typeof fetch
  })

  /** The points a deployment would have written, with a recording binding. */
  const withRecorder = async (
    fn: (trackEnv: Record<string, unknown>) => Promise<unknown>,
  ): Promise<Point[]> => {
    const { written, env: rec } = recorder()
    await fn({ ...(env as unknown as Record<string, unknown>), ...rec })
    return written
  }

  /**
   * The per-*vendor* rows, which are the ones these tests are about.
   *
   * `notify.batch` now carries two kinds of row: one per channel from `notify`,
   * and one per push service from `deliverPush` — marked `source: "vendor"`.
   * Both are useful and they answer different questions ("is email failing" vs
   * "is Apple failing"), so they are told apart by source rather than merged.
   */
  const batches = (written: Point[]) =>
    written.filter((p) => p.blobs?.[0] === "notify.batch" && p.blobs?.[5] === "vendor")

  /** blobs: [event, country, type, channel, service, source] — see `write`. */
  const of = (p: Point) => ({
    type: p.blobs?.[2],
    channel: p.blobs?.[3],
    service: p.blobs?.[4],
    sent: p.doubles?.[0],
    gone: p.doubles?.[1],
    failed: p.doubles?.[2],
  })

  it("counts a delivered push against its own vendor", async () => {
    const user = await makeUser("tel-ok")
    await registerDevice(user, await subscriber("https://web.push.apple.com/tel-ok"), "en")
    await follows(user, "TEAM", "team-tel")

    const written = await withRecorder((e) =>
      notify(db(), e as never, {
        typeCode: "SCORE_UPDATE",
        targets: [{ objectTypeCode: "TEAM", objectId: "team-tel" }],
        tag: "score:g-tel",
        render: {
          PUSH: (_l: string, tag: string) => ({
            channel: "PUSH" as const, title: "t", body: "b", url: "#/live", tag,
          }),
        },
      }),
    )

    const rows = batches(written).map(of)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.channel).toBe("PUSH")
    expect(rows[0]!.service).toBe("apple")
    expect(rows[0]).toMatchObject({ sent: 1, gone: 0, failed: 0 })
  })

  it("separates a dead subscription from a failed send", async () => {
    const dead = await makeUser("tel-dead")
    const broken = await makeUser("tel-broken")
    const deadSub = await subscriber("https://web.push.apple.com/tel-dead")
    await registerDevice(dead, deadSub, "en")
    await registerDevice(broken, await subscriber("https://web.push.apple.com/tel-500"), "en")
    await follows(dead, "TEAM", "team-mixed")
    await follows(broken, "TEAM", "team-mixed")
    status.set(deadSub.endpoint, 410)
    status.set("https://web.push.apple.com/tel-500", 503)

    const written = await withRecorder((e) =>
      notify(db(), e as never, {
        typeCode: "SCORE_UPDATE",
        targets: [{ objectTypeCode: "TEAM", objectId: "team-mixed" }],
        tag: "score:g-mixed",
        render: {
          PUSH: (_l: string, tag: string) => ({
            channel: "PUSH" as const, title: "t", body: "b", url: "#/live", tag,
          }),
        },
      }),
    )

    const row = batches(written).map(of)[0]!
    // 410 is permanent and the row is deleted; 503 may be transient and is not.
    // Averaged together they were indistinguishable.
    expect(row).toMatchObject({ sent: 0, gone: 1, failed: 1 })
  })

  /**
   * The gap that motivated this.
   *
   * `push.sent` is written after `fetch` returns, so a throwing request writes
   * nothing — one push service going down looked identical to no sends at all.
   */
  it("counts a network failure, which the per-attempt row never sees", async () => {
    const user = await makeUser("tel-net")
    await registerDevice(user, await subscriber("https://web.push.apple.com/tel-net"), "en")
    await follows(user, "TEAM", "team-net")

    throws.add("https://web.push.apple.com/tel-net")

    const written = await withRecorder((e) =>
      notify(db(), e as never, {
        typeCode: "SCORE_UPDATE",
        targets: [{ objectTypeCode: "TEAM", objectId: "team-net" }],
        tag: "score:g-net",
        render: {
          PUSH: (_l: string, tag: string) => ({
            channel: "PUSH" as const, title: "t", body: "b", url: "#/live", tag,
          }),
        },
      }),
    )

    const rows = batches(written).map(of)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ sent: 0, gone: 0, failed: 1 })
    // And nothing per-attempt was written for it, which is the whole point.
    expect(written.filter((p) => p.blobs?.[0] === "push.sent")).toHaveLength(0)
  })

  it("splits a mixed batch by vendor, so one failing service is visible", async () => {
    const a = await makeUser("tel-apple")
    const g = await makeUser("tel-fcm")
    await registerDevice(a, await subscriber("https://web.push.apple.com/tel-a"), "en")
    await registerDevice(g, await subscriber("https://fcm.googleapis.com/fcm/send/tel-g"), "en")
    await follows(a, "TEAM", "team-split")
    await follows(g, "TEAM", "team-split")

    // Apple is down; Google is fine. A single row would average this into
    // "half our pushes failed" and say nothing about which half.
    status.set("https://web.push.apple.com/tel-a", 500)

    const written = await withRecorder((e) =>
      notify(db(), e as never, {
        typeCode: "SCORE_UPDATE",
        targets: [{ objectTypeCode: "TEAM", objectId: "team-split" }],
        tag: "score:g-split",
        render: {
          PUSH: (_l: string, tag: string) => ({
            channel: "PUSH" as const, title: "t", body: "b", url: "#/live", tag,
          }),
        },
      }),
    )

    const rows = new Map(batches(written).map(of).map((r) => [r.service, r]))
    expect(rows.get("apple")).toMatchObject({ sent: 0, failed: 1 })
    expect(rows.get("fcm")).toMatchObject({ sent: 1, failed: 0 })
  })

  it("records no endpoint, no path and no user id", async () => {
    const user = await makeUser("tel-priv")
    const sub = await subscriber("https://web.push.apple.com/SECRET-DEVICE-PATH")
    await registerDevice(user, sub, "en")
    await follows(user, "TEAM", "team-priv")

    const written = await withRecorder((e) =>
      notify(db(), e as never, {
        typeCode: "SCORE_UPDATE",
        targets: [{ objectTypeCode: "TEAM", objectId: "team-priv" }],
        tag: "score:g-priv",
        render: {
          PUSH: (_l: string, tag: string) => ({
            channel: "PUSH" as const, title: "t", body: "b", url: "#/live", tag,
          }),
        },
      }),
    )

    // A push endpoint is a bearer capability: the path is the secret. Every
    // blob of every point this send produced is checked, not just the batch row.
    const blobs = written.flatMap((p) => p.blobs ?? []).join(" | ")
    expect(blobs).not.toContain("SECRET-DEVICE-PATH")
    expect(blobs).not.toContain(sub.endpoint)
    expect(blobs).not.toContain(user)
  })
})

/**
 * The queue consumer.
 *
 * Driven directly rather than through a queue runtime — which is why
 * `runNotificationJob` and `handleNotification` are plain exported functions.
 */
describe("Notification fan-out as a job", () => {
  /** A queue that records what was sent to it, standing in for the binding. */
  const fakeQueue = () => {
    const sent: unknown[] = []
    return {
      sent,
      binding: { send: async (body: unknown) => void sent.push(body) } as unknown as Bindings["NOTIFICATIONS"],
    }
  }

  const envWith = (q: Bindings["NOTIFICATIONS"]) =>
    ({ ...(env as unknown as Record<string, unknown>), NOTIFICATIONS: q }) as unknown as Bindings

  it("delivers a slice and re-enqueues the remainder", async () => {
    // More followers than one message may deliver to. The subrequest limit is
    // the thing being defended against: one fetch goes out per recipient.
    /**
     * Followed by TEAM, not by GAME.
     *
     * `RECEIVE_ACTION` in src/api/push.ts maps TEAM, EVENT and PLAYER — the
     * model defines no RECEIVE_GAME_NOTIFICATIONS — so a direct game follow
     * resolves to nobody and this test would have measured the seeded audience
     * instead of its own. Worth knowing: announce()'s GAME target reaches
     * nobody today.
     */
    const game = { id: "gam_001", teamId: "team_001" }
    for (let i = 0; i < CHUNK + 5; i++) {
      const u = await makeUser(`chunk-${i}`)
      await registerDevice(u, await subscriber(`https://push.test/chunk-${i}`), "en")
      await follows(u, "TEAM", game.teamId)
    }

    const q = fakeQueue()
    captured = []
    const first = await runNotificationJob(db(), envWith(q.binding), {
      kind: "game",
      typeCode: "SCORE_UPDATE",
      gameId: game.id,
      actorId: "nobody",
      occurredAt: new Date().toISOString(),
      offset: 0,
    })

    /**
     * The *slice* is capped, which is not the same as the sends.
     *
     * The audience spans channels now, and two seeded users have SCORE_UPDATE
     * enabled on LINE — a channel the vocabulary defines and this Worker has no
     * transport for. Those consume slice capacity and are reported as
     * `no-transport` rather than sent, so `sent` is a little under CHUNK.
     *
     * That is the behaviour worth having: an unsendable channel is *visible*
     * instead of silently dropped, and paying a slot for it is what makes it
     * countable. Asserting `sent === CHUNK` would have been asserting that no
     * such channel exists.
     */
    expect(first.sent, "the slice delivered nothing").toBeGreaterThan(0)
    expect(first.sent, "one message must not exceed the chunk").toBeLessThanOrEqual(CHUNK)
    expect(first.remaining, "there must be a remainder to carry").toBeGreaterThanOrEqual(5)
    // The remainder is a message, not a loop: one job can never approach the
    // subrequest limit however popular a team becomes.
    expect(q.sent).toHaveLength(1)
    expect(q.sent[0]).toMatchObject({ gameId: game.id, offset: CHUNK })

    captured = []
    const second = await runNotificationJob(db(), envWith(q.binding), q.sent[0] as never)
    expect(second.sent, "the second slice delivered nothing").toBeGreaterThan(0)
    expect(second.remaining).toBe(0)
    // And no third message, because there is nothing left.
    expect(q.sent).toHaveLength(1)
  })

  /**
   * The property the whole design rests on.
   *
   * Queues redeliver, and that is safe *only* because a repeated push with the
   * same tag replaces the previous card rather than stacking. If the tag ever
   * becomes unique per send, every retry becomes a second notification and
   * nothing in the code fails.
   */
  it("uses a tag that is a function of the event, not of the attempt", async () => {
    await db().insert(schema.game).values({
      id: "gam_tag",
      eventId: "evt_001",
      homeTeamId: "team_001",
      awayTeamId: "team_003",
      startsAt: new Date().toISOString(),
      statusCode: "LIVE",
    }).onConflictDoNothing()

    const job = {
      kind: "game" as const,
      typeCode: "SCORE_UPDATE" as const,
      gameId: "gam_tag",
      actorId: "nobody",
      occurredAt: new Date().toISOString(),
      offset: 0,
    }
    captured = []
    await runNotificationJob(db(), env as unknown as Bindings, job)
    await runNotificationJob(db(), env as unknown as Bindings, job)

    expect(captured.length, "both attempts delivered").toBeGreaterThan(0)
    const topics = new Set(captured.map((c) => c.headers.get("topic")))
    // One value across every delivery of both attempts. The second card
    // replaces the first rather than stacking, which is what makes redelivery
    // invisible and this design safe without an idempotency ledger.
    expect([...topics]).toEqual(["score:gam_tag"])
  })

  it("says nothing about a game that was deleted before delivery", async () => {
    const outcome = await runNotificationJob(db(), env as unknown as Bindings, {
      kind: "game",
      typeCode: "MATCH_END",
      gameId: "gam_does_not_exist",
      actorId: "nobody",
      occurredAt: new Date().toISOString(),
      offset: 0,
    })
    expect(outcome.sent).toBe(0)
    expect("why" in outcome && outcome.why).toBe("game is gone")
  })
})

describe("What the consumer tells the queue", () => {
  it("acks a malformed message rather than retrying a bad shape", async () => {
    // Retrying three times and then dead-lettering it wastes two attempts and
    // delays the diagnosis. A shape that is wrong now is wrong in a minute.
    const { action } = await handleNotification(env as unknown as Bindings, { nonsense: true })
    expect(action).toBe("ack")
  })

  it("acks a message it completed", async () => {
    const { action } = await handleNotification(env as unknown as Bindings, {
      typeCode: "SCORE_UPDATE",
      gameId: "gam_does_not_exist",
      actorId: "nobody",
      occurredAt: new Date().toISOString(),
    })
    expect(action).toBe("ack")
  })

  /**
   * Swallowing is what `notify` does so it cannot fail the write it follows.
   * Inside a consumer that is exactly wrong: it tells the queue the message
   * succeeded, and a transient D1 outage silently drops every notification
   * during it.
   */
  it("retries an infrastructural failure instead of swallowing it", async () => {
    const broken = {
      ...(env as unknown as Record<string, unknown>),
      DB: {
        prepare() {
          throw new Error("D1_ERROR: storage unavailable")
        },
      },
    } as unknown as Bindings
    const { action } = await handleNotification(broken, {
      typeCode: "SCORE_UPDATE",
      gameId: "gam_001",
      actorId: "nobody",
      occurredAt: new Date().toISOString(),
    })
    expect(action, "a transient failure must be retried, not acked").toBe("retry")
  })
})

/**
 * The second transport, proving the seam is real rather than shaped.
 *
 * The schema has been multi-channel since it was written — a channel
 * vocabulary, a foreign key, and preferences keyed by (user, type, channel).
 * Only the code pinned PUSH. These assert that EMAIL now goes out through
 * `src/mail/mailer.ts` with its own copy, and — more importantly — that it does
 * not go out to anybody who has not asked for it.
 */
describe("EMAIL as a second channel", () => {
  const emailAddress = (userId: string, address: string, locale = "en") =>
    db()
      .insert(schema.userNotificationChannel)
      .values({
        userId,
        channelCode: "EMAIL",
        address,
        addressLabel: `${userId}-email`,
        secret: null,
        localeCode: locale,
        isEnabled: true,
        verifiedAt: new Date().toISOString(),
      })
      .onConflictDoNothing()

  const wants = (userId: string, on: boolean, typeCode = "SCORE_UPDATE") =>
    db()
      .insert(schema.userNotificationPreference)
      .values({ userId, notificationTypeCode: typeCode, channelCode: "EMAIL", isEnabled: on })
      .onConflictDoUpdate({
        target: [
          schema.userNotificationPreference.userId,
          schema.userNotificationPreference.notificationTypeCode,
          schema.userNotificationPreference.channelCode,
        ],
        set: { isEnabled: on },
      })

  /**
   * The safety property, and the reason this change can ship before the
   * preferences UI exists.
   *
   * PUSH is opt-out because the reader installed an app and granted a
   * permission. An email address is not that — it arrives because somebody
   * signed up. If absence meant consent, adding a dispatch table entry would
   * have started emailing every seeded account.
   */
  it("emails nobody who has not turned it on", async () => {
    const u = await makeUser("mail-default-off")
    await emailAddress(u, "default-off@example.invalid")
    await follows(u, "TEAM", "team_001")
    clearOutbox()

    await send([{ objectTypeCode: "TEAM", objectId: "team_001" }])

    expect(
      readOutbox("default-off@example.invalid"),
      "an unstated EMAIL preference must mean no",
    ).toHaveLength(0)
  })

  it("emails somebody who has, with its own subject", async () => {
    const u = await makeUser("mail-opted-in")
    await emailAddress(u, "opted-in@example.invalid")
    await follows(u, "TEAM", "team_001")
    await wants(u, true)
    clearOutbox()

    const result = await notify(db(), env as unknown as Bindings, {
      typeCode: "SCORE_UPDATE",
      targets: [{ objectTypeCode: "TEAM", objectId: "team_001" }],
      tag: "score:mail",
      render: {
        EMAIL: () => ({
          channel: "EMAIL" as const,
          subject: "Assumption 61 – BCC 58",
          text: "Bangkok Schools League\n\nFollow the game: https://example.test/#/games/g1",
          unsubscribeLabel: "Stop receiving these emails:",
        }),
      },
    })

    const inbox = readOutbox("opted-in@example.invalid")
    expect(inbox, "an opted-in address got no email").toHaveLength(1)
    expect(inbox[0]!.subject).toBe("Assumption 61 – BCC 58")
    // Email copy, not push copy: a body with somewhere to go, because it is
    // read outside the app.
    expect(inbox[0]!.body).toContain("https://example.test/#/games/g1")
    expect(result.sent).toBeGreaterThanOrEqual(1)
  })

  /**
   * The failure this design is most likely to produce by accident.
   *
   * A caller writes push copy and no email copy. The type makes the fallback
   * impossible — there is no shared shape — so the channel is skipped and
   * reported rather than sent push text.
   */
  it("sends nothing on a channel the caller wrote no copy for", async () => {
    const u = await makeUser("mail-no-copy")
    await emailAddress(u, "no-copy@example.invalid")
    await follows(u, "TEAM", "team_001")
    await wants(u, true)
    clearOutbox()

    const { written, env: rec } = recorder()
    await notify(db(), { ...(env as unknown as Record<string, unknown>), ...rec } as never, {
      typeCode: "SCORE_UPDATE",
      targets: [{ objectTypeCode: "TEAM", objectId: "team_001" }],
      tag: "score:nocopy",
      // PUSH only. The EMAIL audience exists and is deliberately not served.
      render: {
        PUSH: (_l: string, tag: string) => ({
          channel: "PUSH" as const, title: "t", body: "b", url: "#/live", tag,
        }),
      },
    })

    expect(readOutbox("no-copy@example.invalid"), "push copy must not become an email").toHaveLength(0)
    // And it is visible, not silent.
    const noCopy = written.filter(
      (p) => p.blobs?.[0] === "notify.batch" && p.blobs?.[3] === "EMAIL" && p.blobs?.[4] === "no-copy",
    )
    expect(noCopy, "a skipped channel must be reported").not.toHaveLength(0)
  })

  it("reports a channel the vocabulary defines and this Worker cannot send on", async () => {
    // LINE, SMS and IN_APP are real rows in the model with no transport here.
    // Counted rather than dropped: "the Product Owner described a channel we do
    // not have" is a state worth seeing.
    const u = await makeUser("mail-line")
    await db().insert(schema.userNotificationChannel).values({
      userId: u, channelCode: "LINE", address: "U-line-test", addressLabel: `${u}-line`,
      secret: null, localeCode: "en", isEnabled: true, verifiedAt: new Date().toISOString(),
    }).onConflictDoNothing()
    await db().insert(schema.userNotificationPreference).values({
      userId: u, notificationTypeCode: "SCORE_UPDATE", channelCode: "LINE", isEnabled: true,
    }).onConflictDoNothing()
    await follows(u, "TEAM", "team_001")

    const { written, env: rec } = recorder()
    await notify(db(), { ...(env as unknown as Record<string, unknown>), ...rec } as never, {
      typeCode: "SCORE_UPDATE",
      targets: [{ objectTypeCode: "TEAM", objectId: "team_001" }],
      tag: "score:line",
      render: {
        PUSH: (_l: string, tag: string) => ({
          channel: "PUSH" as const, title: "t", body: "b", url: "#/live", tag,
        }),
      },
    })

    const noTransport = written.filter(
      (p) => p.blobs?.[0] === "notify.batch" && p.blobs?.[4] === "no-transport",
    )
    expect(noTransport, "an undeliverable channel must be countable").not.toHaveLength(0)
  })
})

/**
 * One-click unsubscribe, and the two ways it goes silently wrong.
 *
 * A missing header on bulk mail is a spam complaint. A present one on a sign-in
 * code is a promise nothing can honour. Neither shows up without being asserted,
 * which is why both directions are here.
 */
describe("Unsubscribe", () => {
  const E = env as unknown as Bindings

  const emailUser = async (id: string, address: string) => {
    const u = await makeUser(id)
    await db().insert(schema.userNotificationChannel).values({
      userId: u, channelCode: "EMAIL", address, addressLabel: `${u}-email`,
      secret: null, localeCode: "en", isEnabled: true, verifiedAt: new Date().toISOString(),
    }).onConflictDoNothing()
    await db().insert(schema.userNotificationPreference).values({
      userId: u, notificationTypeCode: "SCORE_UPDATE", channelCode: "EMAIL", isEnabled: true,
    }).onConflictDoUpdate({
      target: [
        schema.userNotificationPreference.userId,
        schema.userNotificationPreference.notificationTypeCode,
        schema.userNotificationPreference.channelCode,
      ],
      set: { isEnabled: true },
    })
    await follows(u, "TEAM", "team_001")
    return u
  }

  const prefOf = async (userId: string, typeCode = "SCORE_UPDATE") =>
    (await db()
      .select({ on: schema.userNotificationPreference.isEnabled })
      .from(schema.userNotificationPreference)
      .where(
        and(
          eq(schema.userNotificationPreference.userId, userId),
          eq(schema.userNotificationPreference.notificationTypeCode, typeCode),
          eq(schema.userNotificationPreference.channelCode, "EMAIL"),
        ),
      ))[0]?.on

  const sendScore = () =>
    notify(db(), E, {
      typeCode: "SCORE_UPDATE",
      targets: [{ objectTypeCode: "TEAM", objectId: "team_001" }],
      tag: "score:unsub",
      render: {
        EMAIL: () => ({
          channel: "EMAIL" as const,
          subject: "A score",
          text: "Body.",
          unsubscribeLabel: "Stop receiving these emails:",
        }),
      },
    })

  it("puts both headers on a notification email", async () => {
    const u = await emailUser("unsub-headers", "headers@example.invalid")
    clearOutbox()
    await sendScore()

    const [mail] = readOutbox("headers@example.invalid")
    expect(mail, "no notification email was sent").toBeTruthy()
    expect(mail!.headers["List-Unsubscribe"]).toMatch(/^<https?:\/\/.+\/api\/unsubscribe\?t=.+>$/)
    // Without this the header is a link, not one-click: the client shows it and
    // the reader still has to visit a page. Gmail and Yahoo require the pair.
    expect(mail!.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click")
    // Never the address: a link in an email reaches browser history, referrer
    // headers and proxy logs, and a user id is opaque where an address is not.
    expect(mail!.headers["List-Unsubscribe"]).not.toContain("headers@example.invalid")
    expect(u).toBeTruthy()
  })

  it("puts NEITHER header on a sign-in code", async () => {
    // Offering to unsubscribe from your own authentication is nonsense, and the
    // header would be a lie — there is no preference behind it to turn off.
    clearOutbox()
    const res = await post("/api/auth/email-otp/send-verification-otp", {
      email: "otp-headers@example.invalid",
      type: "sign-in",
    })
    expect(res.status).toBe(200)

    const [mail] = readOutbox("otp-headers@example.invalid")
    expect(mail, "no sign-in email was sent").toBeTruthy()
    expect(mail!.headers["List-Unsubscribe"]).toBeUndefined()
    expect(mail!.headers["List-Unsubscribe-Post"]).toBeUndefined()
  })

  it("sends bulk from a different identity than sign-in", async () => {
    // Authentication is email OTP, so a reputation hit on notifications would
    // take sign-in with it — and nobody could sign in to turn the notifications
    // off. Reputation attaches per domain, so the split is a subdomain.
    await emailUser("unsub-from", "from@example.invalid")
    clearOutbox()
    await sendScore()
    await post("/api/auth/email-otp/send-verification-otp", {
      email: "from-otp@example.invalid",
      type: "sign-in",
    })

    const bulk = readOutbox("from@example.invalid")[0]!
    const transactional = readOutbox("from-otp@example.invalid")[0]!
    expect(bulk.from).not.toBe(transactional.from)
    expect(bulk.from).toContain("notify.")
  })

  it("shows the link in the body, not only in a header", async () => {
    // Somebody already annoyed will not go hunting in their mail client's
    // menus. The alternative to finding the door is pressing "spam".
    await emailUser("unsub-body", "body@example.invalid")
    clearOutbox()
    await sendScore()

    const [mail] = readOutbox("body@example.invalid")
    expect(mail!.body).toContain("Stop receiving these emails:")
    expect(mail!.body).toContain("/api/unsubscribe?t=")
  })

  /**
   * The one that is easy to get backwards and expensive when you do.
   *
   * Mail scanners, link previewers and corporate security gateways follow GET
   * links in messages they inspect. A GET that acted would silently unsubscribe
   * everybody whose employer scans their inbox — they never clicked anything.
   */
  it("a GET renders a confirmation and changes NOTHING", async () => {
    const u = await emailUser("unsub-get", "get@example.invalid")
    const token = await unsubscribeToken(E, { userId: u, typeCode: "SCORE_UPDATE" })

    expect(await prefOf(u), "precondition: the preference is on").toBe(true)

    const res = await api(`/api/unsubscribe?t=${encodeURIComponent(token)}`)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain("<form method=\"post\"")

    expect(
      await prefOf(u),
      "a scanner following the link must not unsubscribe anybody",
    ).toBe(true)
  })

  it("a POST unsubscribes, with no confirmation, per RFC 8058", async () => {
    const u = await emailUser("unsub-post", "post@example.invalid")
    const token = await unsubscribeToken(E, { userId: u, typeCode: "SCORE_UPDATE" })

    const res = await api(`/api/unsubscribe?t=${encodeURIComponent(token)}`, { method: "POST" })
    expect(res.status).toBe(200)
    expect(await prefOf(u)).toBe(false)
  })

  it("changes exactly one preference row and nothing else", async () => {
    const u = await emailUser("unsub-scope", "scope@example.invalid")
    // A second type, and the push channel, both left alone.
    await db().insert(schema.userNotificationPreference).values([
      { userId: u, notificationTypeCode: "MATCH_END", channelCode: "EMAIL", isEnabled: true },
      { userId: u, notificationTypeCode: "SCORE_UPDATE", channelCode: "PUSH", isEnabled: true },
    ]).onConflictDoNothing()

    const token = await unsubscribeToken(E, { userId: u, typeCode: "SCORE_UPDATE" })
    await api(`/api/unsubscribe?t=${encodeURIComponent(token)}`, { method: "POST" })

    expect(await prefOf(u, "SCORE_UPDATE")).toBe(false)
    expect(await prefOf(u, "MATCH_END"), "another type must be untouched").toBe(true)
    const push = (await db()
      .select({ on: schema.userNotificationPreference.isEnabled })
      .from(schema.userNotificationPreference)
      .where(
        and(
          eq(schema.userNotificationPreference.userId, u),
          eq(schema.userNotificationPreference.channelCode, "PUSH"),
        ),
      ))[0]?.on
    expect(push, "a link in an email must not be able to stop push").toBe(true)
  })

  it("refuses a token that was not signed by us", async () => {
    const u = await emailUser("unsub-forged", "forged@example.invalid")
    const real = await unsubscribeToken(E, { userId: u, typeCode: "SCORE_UPDATE" })
    // Same claim, a signature that is not ours.
    const forged = `${real.split(".")[0]}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`

    const res = await api(`/api/unsubscribe?t=${encodeURIComponent(forged)}`, { method: "POST" })
    expect(res.status).toBe(400)
    expect(await prefOf(u), "a forged token must change nothing").toBe(true)
  })

  it("cannot be pointed at somebody else by editing the claim", async () => {
    // The signature covers the whole claim, so swapping the user id invalidates
    // it. Without that, one valid link would unsubscribe anybody whose id you
    // could guess.
    const victim = await emailUser("unsub-victim", "victim@example.invalid")
    const tampered = `${btoa(`${victim}:SCORE_UPDATE`).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}.notasignature`

    const res = await api(`/api/unsubscribe?t=${encodeURIComponent(tampered)}`, { method: "POST" })
    expect(res.status).toBe(400)
    expect(await prefOf(victim)).toBe(true)
  })
})
