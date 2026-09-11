import { createAuth } from "./auth"
import { track } from "./analytics"
import type { Bindings } from "./types"

/**
 * Better Auth's subtree, and the one thing we add to it.
 *
 * Better Auth is a fetch handler and owns its own routing, its own
 * authorisation and its own origin checking. This is not a router around it —
 * it forwards the request untouched and returns the response untouched.
 *
 * What it adds is the telemetry, which is the reason this is a function rather
 * than `auth(env).handler(request)` written inline in the dispatch. Sign-in
 * was the only part of the app with no telemetry at all, which is backwards:
 * it is where real people get stuck, where the rate limits bite, and where
 * abuse shows up first.
 */

/**
 * Better Auth's own error code, from a response we are not allowed to consume.
 *
 * The body says `{"message":"Invalid OTP","code":"INVALID_OTP"}`, and the code
 * is the part worth counting — the message is prose that changes with a version
 * bump and differs per locale. Read off a clone, because the real response is on
 * its way to the browser and a consumed body is an empty page.
 *
 * Only ever called on a non-2xx, so the ordinary sign-in pays nothing for it.
 */
async function codeOf(res: Response): Promise<string> {
  try {
    const body = (await res.clone().json()) as { code?: unknown }
    return typeof body.code === "string" ? body.code : ""
  } catch {
    // Not JSON — a redirect, or HTML from something upstream. The status alone
    // still says what happened.
    return ""
  }
}

export async function handleAuth(request: Request, env: Bindings): Promise<Response> {
  // `headers` so the OTP mail can read Accept-Language — the browser asking for
  // a code is the one about to read it.
  const betterAuth = createAuth({
    env,
    req: { url: request.url },
    headers: request.headers,
    cf: (request as Request & { cf?: { city?: string; country?: string; region?: string; asOrganization?: string } }).cf,
  })

  const started = Date.now()
  const res = await betterAuth.handler(request)

  /**
   * What happened, for attempts only.
   *
   * **POSTs, not every request.** An auth attempt — asking for a code, spending
   * one, signing out — is a POST; reading the current session is a GET and
   * happens on every page load in the app. Recording those would bury the
   * handful of rows that matter under a request-rate graph, and Better Auth's
   * route list would decide our sampling for us.
   *
   * This is the one place the whole system records successes. Everywhere else
   * the failures are the signal; here a failure count means nothing without
   * knowing how many attempts there were, because "forty invalid codes" reads
   * completely differently at forty-two attempts and at four thousand.
   */
  if (request.method === "POST") {
    track(
      env,
      "auth.attempt",
      {
        // `sign-in/email-otp`, not the whole URL. No address, no code, no token
        // — this says which door was tried and how it went, and nothing about
        // who tried it.
        action: new URL(request.url).pathname.replace(/^\/api\/auth\//, ""),
        status: String(res.status),
        code: res.ok ? "" : await codeOf(res),
        ms: Date.now() - started,
      },
      (request as Request & { cf?: { country?: string } }).cf?.country,
    )
  }

  return res
}
