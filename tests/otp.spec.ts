import { test, expect, type APIRequestContext } from "@playwright/test"
import { BASE, IS_LOCAL } from "./helpers/auth"

// ADR 012. The rest of the suite signs the six seeded actors in with a fixed
// code, because they are shared and `fullyParallel` tests would otherwise race
// each other's code rotation. That is a deliberate shortcut, and it would hide
// a broken mail path — so this spec covers the genuine thing: a random code,
// generated, mailed, read back out of the outbox, and redeemed.
//
// Every address here is unique to its test, so nothing rotates underneath it.

test.describe("Sign-in by emailed code", () => {
  test.skip(!IS_LOCAL, "reading a real emailed code needs the local dev outbox")

  const fresh = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`

  async function requestCode(request: APIRequestContext, email: string) {
    const res = await request.post("/api/auth/email-otp/send-verification-otp", {
      data: { email, type: "sign-in" },
      headers: { Origin: BASE },
    })
    expect(res.ok()).toBeTruthy()
  }

  async function codeFor(request: APIRequestContext, email: string) {
    const res = await request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)
    expect(res.ok()).toBeTruthy()
    const { messages } = await res.json()
    const m = messages[0]?.body?.match(/Your code is (\d{6})/)
    expect(m, "a code should have been emailed").toBeTruthy()
    return m![1]!
  }

  test("a real random code is emailed and works", async ({ request }) => {
    const email = fresh("otp")
    await requestCode(request, email)

    const [mail] = await (await request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json()
      .then((b: { messages: { subject: string; body: string }[] }) => b.messages)
    expect(mail.subject).toMatch(/^\d{6} is your Remy Sport code$/)
    // The code must not be the fixed one — that only applies to @remy.dev.
    const code = mail.body.match(/Your code is (\d{6})/)![1]!
    expect(code).not.toBe("424242")

    const res = await request.post("/api/auth/sign-in/email-otp", {
      data: { email, otp: code },
      headers: { Origin: BASE },
    })
    expect(res.status()).toBe(200)
  })

  test("a first-time address gets an account, defaulted to spectator", async ({ request }) => {
    // Passwordless means sign-in *is* sign-up. The default-role hook has to
    // apply here too, or the new account matches no role in access-control.ts.
    const email = fresh("newcomer")
    await requestCode(request, email)
    const res = await request.post("/api/auth/sign-in/email-otp", {
      data: { email, otp: await codeFor(request, email) },
      headers: { Origin: BASE },
    })
    expect(res.status()).toBe(200)
    const session = await (await request.get("/api/auth/get-session")).json()
    expect(session.user.role).toBe("spectator")
    // Possession of the code proves the address, so nothing further is needed.
    expect(session.user.emailVerified).toBe(true)
  })

  test("a code cannot be used twice", async ({ request }) => {
    const email = fresh("replay")
    await requestCode(request, email)
    const code = await codeFor(request, email)

    expect((await request.post("/api/auth/sign-in/email-otp", {
      data: { email, otp: code }, headers: { Origin: BASE },
    })).status()).toBe(200)

    // Replay of a captured code must fail, or the email is a standing credential.
    expect((await request.post("/api/auth/sign-in/email-otp", {
      data: { email, otp: code }, headers: { Origin: BASE },
    })).ok()).toBeFalsy()
  })

  test("requesting a new code invalidates the previous one", async ({ request }) => {
    const email = fresh("rotate")
    await requestCode(request, email)
    const first = await codeFor(request, email)
    await requestCode(request, email)
    const second = await codeFor(request, email)
    expect(second).not.toBe(first)

    const res = await request.post("/api/auth/sign-in/email-otp", {
      data: { email, otp: first },
      headers: { Origin: BASE },
    })
    expect(res.ok(), "the superseded code must not work").toBeFalsy()
  })

  test("a wrong code is refused", async ({ request }) => {
    const email = fresh("wrong")
    await requestCode(request, email)
    const res = await request.post("/api/auth/sign-in/email-otp", {
      data: { email, otp: "000000" },
      headers: { Origin: BASE },
    })
    expect(res.ok()).toBeFalsy()
  })
})
