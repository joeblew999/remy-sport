import { createORPCClient } from "@orpc/client"
import { OpenAPILink } from "@orpc/openapi-client/fetch"
import type { RouterClient } from "@orpc/server"
import { router, type Router } from "./api"

/**
 * The typed client for everything outside the browser bundle.
 *
 * `bun run ops`, the deploy, and the Playwright suites all called the API with
 * a hand-written `fetch` and a hand-written response type — so a renamed
 * procedure or a changed field broke them at runtime, on a deployment, in
 * whichever script happened to run first. Through this they break at compile
 * time instead, which is the whole point: `tsc` is the test that the ops
 * scripts still agree with the API.
 *
 * **OpenAPI link over `/api` for everything outside `src/web/`.** That is the
 * surface external clients use, and it is the right one for a CLI and for
 * Playwright for the same reason: CORS is open there and no CSRF header is
 * involved. `/rpc` requires `x-csrf-token`, which exists to separate our own
 * page from a cross-site one — a question that means nothing for a script, and
 * a header a script would only be copying to satisfy a check aimed elsewhere.
 *
 * The SPA keeps `src/web/lib/orpc.ts` on `RPCLink` against `/rpc`: same-origin,
 * the hot path, and the CSRF plugin belongs to that transport.
 *
 * Here rather than under `src/api/`, which holds procedures only — this is a
 * consumer of them, and lives beside the other cross-cutting modules.
 */

export interface ApiClientOptions {
  /**
   * Sent on every call. A signed-in caller passes its session cookie here.
   *
   * A function rather than a value would let a caller refresh mid-run; nothing
   * needs that yet, and a plain record is what every current call site has.
   */
  headers?: Record<string, string>
}

/**
 * A client for one deployment.
 *
 * `baseUrl` is the origin, not a path: the link appends `/api` itself, so a
 * caller cannot get that half right and the other half wrong. Scripts resolve
 * it from `originOf(resolveTarget(argv))` — the same `--env` resolution
 * everything else uses — rather than typing a hostname, which is how one
 * script ends up smoking production while its neighbour smokes staging.
 */
export function createApiClient(baseUrl: string, options: ApiClientOptions = {}): RouterClient<Router> {
  const link = new OpenAPILink(router, {
    url: `${baseUrl.replace(/\/+$/, "")}/api`,
    headers: () => options.headers ?? {},
    // Cookies are passed explicitly through `headers` when a caller has a
    // session. Nothing here runs in a browser, so there is no ambient cookie
    // jar to include and `credentials` would be meaningless.
  })
  return createORPCClient(link)
}
