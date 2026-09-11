import type { APIRequestContext } from "@playwright/test"
import { createApiClient } from "../../src/api-client.ts"
import { LOCAL_BROWSER_ORIGIN } from "../../scripts/lib/local-browser.ts"

/**
 * The default base, resolved here rather than imported from ./auth.ts.
 *
 * That import pulled `@playwright/test` into this module's graph, which put the
 * whole helper out of reach of the unit tier — and the unit tier is where the
 * bug that cost a deploy would have been caught in a second.
 *
 * `E2E_ORIGIN`, because the name it used to share — `BASE_URL` — is Vite's for
 * the public base path, and Vitest injects `"/"` for it. The rename closes that
 * route; the absoluteness check stays anyway, because it is cheap and it says
 * what this value has to be.
 */
const DEFAULT_BASE = /^https?:\/\//.test(process.env.E2E_ORIGIN ?? "")
  ? process.env.E2E_ORIGIN!
  : LOCAL_BROWSER_ORIGIN

/**
 * The typed client, built from whichever fetch the caller has.
 *
 * Two tiers need it and they hold different things. Playwright has an
 * `APIRequestContext` carrying the suite's stored session; the worker pool has
 * `SELF.fetch`, which reaches the Worker inside the isolate and never leaves
 * it. Neither is the global fetch, and a helper that hardcoded either would
 * work for one tier and silently sign the other out — or send it over a
 * network that is not running.
 *
 * So the fetch is a parameter. `apiWith` is the primitive; `apiFor` is the
 * Playwright adapter over it, and the `@playwright/test` import above is
 * type-only, so the worker tier can import this file without loading
 * Playwright at all.
 *
 * Only for setup and observation: seeding before a suite, reading a code out
 * of the dev outbox. Where a test is *about* the HTTP surface — a status code,
 * a content type, a refusal — it keeps its raw request, because the typed
 * client would hide exactly what that test exists to see.
 */

/**
 * A client over any fetch.
 *
 * `baseUrl` is required and must be absolute. The link builds a `new URL` from
 * it eagerly, so a relative base throws "Invalid URL" at the first call rather
 * than at construction — which `tsc` cannot see and the e2e gate caught on the
 * first deploy after this landed.
 */
export function apiWith(fetch: (request: Request) => Promise<Response>, baseUrl: string) {
  return createApiClient(baseUrl, { fetch })
}

/** The same client, over Playwright's request context. */
export function apiFor(request: APIRequestContext, baseUrl: string = DEFAULT_BASE) {
  return apiWith(async (req) => {
    const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.text()
    const res = await request.fetch(req.url, {
      method: req.method,
      headers: Object.fromEntries(req.headers.entries()),
      ...(body ? { data: body } : {}),
    })
    // `body()` gives a Node Buffer; the Response wants a web body, and a
    // Uint8Array view over the same bytes is that without a copy.
    const bytes = new Uint8Array(await res.body())
    return new Response(bytes, { status: res.status(), headers: res.headers() })
  }, baseUrl)
}
