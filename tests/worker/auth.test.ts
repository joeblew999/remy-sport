import { SELF } from "cloudflare:test"
import { beforeAll, describe, expect, it } from "vitest"
import { SEED_ENTITIES } from "../../src/db/seed-data"
import { ORIGIN, actorFor, api, post, seed, signIn } from "./helpers"

/**
 * Sign-in, in workerd. Converted from tests/auth.spec.ts and tests/otp.spec.ts.
 *
 * Neither ever needed a browser: both drove the API with Playwright's `request`
 * fixture. What they cost was a wrangler dev server, a Playwright runner, and a
 * slot in a 1.6-minute suite.
 *
 * The outbox tests come along too. They used to `test.skip(!IS_LOCAL)` because
 * reading a real emailed code needs `MAIL_TRANSPORT=outbox`, which a deployed
 * run does not have — here that binding is set per test file in
 * vitest.config.ts, so the mail path is always exercised rather than skipped
 * exactly when someone runs the suite against production.
 */

const ADMIN = actorFor("ADMIN")
const SPECTATOR = actorFor("SPECTATOR")

const nameFor = (roleCode: string) =>
  SEED_ENTITIES.users.find((u) => u.roleCode === roleCode)!.names.en

/** A unique address per test, so nothing rotates a code underneath another. */
let n = 0
const fresh = (p: string) => `${p}-${++n}@example.com`

async function outbox(email: string) {
  const res = await api(`/api/dev/outbox?to=${encodeURIComponent(email)}`)
  expect(res.status, "the dev outbox should exist under MAIL_TRANSPORT=outbox").toBe(200)
  const { messages } = (await res.json()) as { messages: { subject: string; body: string }[] }
  return messages
}

const codeFrom = (body: string) => {
  const m = body.match(/Your code is (\d{6})/)
  expect(m, "a code should have been emailed").toBeTruthy()
  return m![1]!
}

beforeAll(seed)

describe("seeding", () => {
  it("creates every actor the fixtures define, idempotently", async () => {
    const res = await SELF.fetch(`${ORIGIN}/api/seed`, { method: "POST" })
    const body = (await res.json()) as { seeded: { status: string }[] }
    // As many as the fixtures define, not a number typed here.
    expect(body.seeded).toHaveLength(SEED_ENTITIES.users.length)
    for (const u of body.seeded) expect(["created", "exists"]).toContain(u.status)
  })
})

describe("seeded actors sign in with the fixed code", () => {
  it("admin gets a session carrying their identity", async () => {
    const cookie = await signIn(ADMIN)
    const session = (await (await api("/api/auth/get-session", { cookie })).json()) as {
      user: { email: string; name: string }
      session: { token: string }
    }
    expect(session.user.email).toBe(ADMIN)
    expect(session.user.name).toBe(nameFor("ADMIN"))
    expect(session.session.token).toBeTruthy()
  })

  it("spectator too — sign-in is not admin-shaped", async () => {
    const cookie = await signIn(SPECTATOR)
    const session = (await (await api("/api/auth/get-session", { cookie })).json()) as {
      user: { email: string; name: string }
    }
    expect(session.user.email).toBe(SPECTATOR)
    expect(session.user.name).toBe(nameFor("SPECTATOR"))
  })

  it("a wrong code is refused", async () => {
    await post("/api/auth/email-otp/send-verification-otp", { email: ADMIN, type: "sign-in" })
    const res = await post("/api/auth/sign-in/email-otp", { email: ADMIN, otp: "000000" })
    expect(res.status).not.toBe(200)
  })

  it("password sign-in does not exist", async () => {
    // ADR 012: not "passwords are discouraged" but "there is no password path".
    // If this ever succeeds, a second way in has returned.
    const res = await post("/api/auth/sign-in/email", { email: ADMIN, password: "admin1234!" })
    expect(res.status).not.toBe(200)
  })
})

describe("a genuinely emailed code", () => {
  // The fixed TEST_OTP above is a shortcut for the six shared actors, and it
  // would hide a broken mail path. These use a real generated code, mailed,
  // read back out of the outbox, and redeemed.
  it("is mailed, and works", async () => {
    const email = fresh("otp")
    await post("/api/auth/email-otp/send-verification-otp", { email, type: "sign-in" })

    const [mail] = await outbox(email)
    expect(mail!.subject).toMatch(/^\d{6} is your Remy Sport code$/)

    const res = await post("/api/auth/sign-in/email-otp", { email, otp: codeFrom(mail!.body) })
    expect(res.status).toBe(200)
  })

  it("gives a first-time address an account, defaulted to spectator", async () => {
    const email = fresh("new")
    await post("/api/auth/email-otp/send-verification-otp", { email, type: "sign-in" })
    const [mail] = await outbox(email)
    const res = await post("/api/auth/sign-in/email-otp", { email, otp: codeFrom(mail!.body) })
    expect(res.status).toBe(200)

    const cookie = res.headers.get("set-cookie")!.split(";")[0]!
    const session = (await (await api("/api/auth/get-session", { cookie })).json()) as {
      user: { role: string }
    }
    // Sign-up is not a separate act, and it does not grant anything.
    expect(session.user.role).toBe("spectator")
  })

  it("cannot be used twice", async () => {
    const email = fresh("once")
    await post("/api/auth/email-otp/send-verification-otp", { email, type: "sign-in" })
    const [mail] = await outbox(email)
    const code = codeFrom(mail!.body)

    expect((await post("/api/auth/sign-in/email-otp", { email, otp: code })).status).toBe(200)
    expect((await post("/api/auth/sign-in/email-otp", { email, otp: code })).status).not.toBe(200)
  })

  it("is invalidated by requesting a newer one", async () => {
    const email = fresh("rotate")
    await post("/api/auth/email-otp/send-verification-otp", { email, type: "sign-in" })
    const first = codeFrom((await outbox(email))[0]!.body)

    await post("/api/auth/email-otp/send-verification-otp", { email, type: "sign-in" })
    const messages = await outbox(email)
    const second = codeFrom(messages[0]!.body)
    expect(second).not.toBe(first)

    expect((await post("/api/auth/sign-in/email-otp", { email, otp: first })).status).not.toBe(200)
    expect((await post("/api/auth/sign-in/email-otp", { email, otp: second })).status).toBe(200)
  })
})
