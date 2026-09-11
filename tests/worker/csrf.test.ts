import { SELF } from "cloudflare:test"
import { describe, expect, it } from "vitest"
import { ORIGIN, actorFor } from "./helpers"

/**
 * A forged cross-site POST is refused, on both surfaces that take cookies.
 *
 * Neither assertion existed. `csrf()` was mounted in src/index.ts and nothing
 * said what it stopped — every other test sends `Origin: ORIGIN`, so a
 * suite-wide pass proved only that same-origin requests work.
 *
 * Writing them found that `csrf()` stopped nothing. Removing it leaves the
 * auth assertion green, because Better Auth compares the Origin against its
 * own `trustedOrigins` and refuses with INVALID_ORIGIN (src/auth.ts) — the
 * middleware was a second lock on a door Better Auth already holds. And the
 * SPA's own transport, `/rpc`, was never behind it at all: the oRPC handler
 * returns before the middleware runs, so a cross-site POST carrying the
 * reader's cookies reached a procedure.
 *
 * So this is not parity. The auth test pins a guarantee that was already
 * there and untested; the `/rpc` test is red until the plugin lands.
 */

const FOREIGN = "https://evil.example"

const post = (path: string, origin: string, body: unknown) =>
  SELF.fetch(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(body),
  })

describe("cross-origin POSTs", () => {
  const credentials = { email: actorFor("COACH"), type: "sign-in" }
  const AUTH = "/api/auth/email-otp/send-verification-otp"

  it("refuses one aimed at the auth routes", async () => {
    const res = await post(AUTH, FOREIGN, credentials)
    expect(res.status).toBe(403)
  })

  it("still allows the same request from our own origin", async () => {
    // The other half of the assertion. A guard that refused everything would
    // pass the test above and break every sign-in.
    const res = await post(AUTH, ORIGIN, credentials)
    expect(res.status).toBe(200)
  })
})

/**
 * The SPA's transport refuses anything a cross-site page could send.
 *
 * Header-based rather than origin-based, which is the stronger test: a browser
 * cannot set a custom header on a cross-site request without a CORS preflight,
 * and `/rpc` grants no CORS. So "carries the header" and "came from our own
 * page" are the same set, without trusting an Origin the caller wrote.
 */
describe("the SPA transport", () => {
  const RPC = "/rpc/health/get"

  it("refuses a POST that carries no oRPC client header", async () => {
    const res = await post(RPC, ORIGIN, {})
    expect(res.status).toBe(403)
  })

  it("serves one that does", async () => {
    const res = await SELF.fetch(`${ORIGIN}${RPC}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, "x-csrf-token": "orpc" },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(200)
  })
})
