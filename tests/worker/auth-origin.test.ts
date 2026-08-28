/**
 * The session cookie's shape follows the origin the reader is actually on.
 *
 * There are three now — localhost, the dev tunnel, and production — and the
 * cookie is scoped differently for each. `baseURL` used to be pinned to
 * `https://remy.ubuntusoftware.net`, so Better Auth saw https everywhere and
 * always issued a `__Secure-` prefixed cookie. A browser refuses to store one
 * of those over plain http, so signing in on http://localhost returned 200 with
 * a token and then had no session.
 *
 * That hid for a long time because the e2e tier runs Chromium, which is lenient
 * about `__Secure-` on localhost. WebKit is not, and WebKit is what the phone
 * runs. These tests are the reason it cannot come back quietly.
 *
 * The scheme comes from `x-forwarded-proto` when a proxy is in front, because
 * cloudflared terminates TLS and forwards plain http — so `c.req.url` says
 * `http://` for a request the reader made over `https://`.
 */
import { describe, it, expect } from "vitest"
import { createAuth } from "../../src/auth"
import { env } from "cloudflare:test"

const host = (url: string, headers: Record<string, string> = {}) => ({
  env: env as never,
  req: { url },
  headers: new Headers(headers),
})

describe("the session cookie follows the request's real origin", () => {
  it("is not Secure on plain localhost", async () => {
    const auth = createAuth(host("http://localhost:8787/api/auth/x"))
    expect(auth.options.baseURL).toBe("http://localhost:8787")
  })

  it("is https when a proxy says the reader used https", () => {
    // The dev tunnel: cloudflared terminates TLS and forwards http, and
    // `wrangler dev --host` rewrites the Host on top of that. Believing the URL
    // means a non-secure cookie over a secure connection.
    const auth = createAuth(
      host("http://192.168.1.100/api/auth/x", { "x-forwarded-proto": "https" }),
    )
    expect(auth.options.baseURL).toBe("https://192.168.1.100")
  })

  it("also reads Cloudflare's cf-visitor", () => {
    const auth = createAuth(
      host("http://192.168.1.100/api/auth/x", { "cf-visitor": '{"scheme":"https"}' }),
    )
    expect(auth.options.baseURL).toBe("https://192.168.1.100")
  })

  it("ignores a malformed cf-visitor rather than failing the request", () => {
    const auth = createAuth(host("http://localhost:8787/api/auth/x", { "cf-visitor": "{oops" }))
    expect(auth.options.baseURL).toBe("http://localhost:8787")
  })

  it("takes only the scheme from headers, never the host", () => {
    // The cookies carry no `Domain`, so they are host-only and the browser
    // scopes them to the name it asked for. Trusting a forwarded host would
    // let a caller choose the origin the server believes it is on.
    const auth = createAuth(
      host("http://localhost:8787/api/auth/x", {
        "x-forwarded-proto": "https",
        "x-forwarded-host": "evil.example.com",
      }),
    )
    expect(auth.options.baseURL).toBe("https://localhost:8787")
  })
})
