import { describe, expect, it } from "vitest"
import { api } from "./helpers"

/**
 * The demo sign-in picker offers only accounts that can actually sign in.
 *
 * Kept its own gate through the oRPC move rather than taking a
 * `dev(capability)`: three questions decide it — is the picker offered, may
 * the admin appear, can a code be read — and they resolve differently on
 * staging than anywhere else.
 */

describe("GET /api/dev/accounts", () => {
  it("lists seeded accounts with what each one holds", async () => {
    const res = await api("/api/dev/accounts")
    expect(res.status).toBe(200)

    const body = (await res.json()) as {
      code?: string
      accounts: { role: string; email: string; name: string; holds: string[] }[]
    }
    expect(body.accounts.length).toBeGreaterThan(0)
    for (const a of body.accounts) {
      expect(a.email, "every offered account needs an address to sign in with").toBeTruthy()
      expect(Array.isArray(a.holds)).toBe(true)
    }
    // The worker tier captures mail, so the code is read from the outbox and
    // must NOT be published here.
    expect(body.code, "a captured-mail environment publishes no code").toBeUndefined()
  })

  it("offers nobody the model refuses a session to", async () => {
    const body = (await (await api("/api/dev/accounts")).json()) as {
      accounts: { email: string }[]
    }
    // A one-click button that cannot work is the thing this list exists to
    // avoid: SUSPENDED and DEACTIVATED fixtures fail at session.create.before.
    const offered = body.accounts.map((a) => a.email)
    for (const email of offered) {
      const sent = await api("/api/auth/email-otp/send-verification-otp", {
        method: "POST",
        body: JSON.stringify({ email, type: "sign-in" }),
      })
      expect(sent.status, `${email} is offered but cannot be sent a code`).toBe(200)
    }
  })
})
