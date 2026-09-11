import { RPCHandler } from "@orpc/server/fetch"
import { SimpleCsrfProtectionHandlerPlugin } from "@orpc/server/plugins"
import { router } from "./api"
import { openApiHandler } from "./api/openapi"
import { telemetryInterceptor } from "./api/telemetry"
import { handleAuth } from "./auth-handler"
import { DISPATCH } from "./dispatch"
import { scheduled } from "./scheduled"
import { handleNotification } from "./api/notify-queue"
import { track } from "./analytics"
import type { Bindings } from "./types"

/**
 * The whole server surface: Better Auth, oRPC, assets.
 *
 * There is no router library. `DISPATCH` in src/dispatch.ts declares which
 * handler owns which prefix and in what order; this file iterates it. Order is
 * the documentation — auth before oRPC because Better Auth owns its subtree,
 * RPC before OpenAPI because the SPA is the hot path, assets before the shell
 * because a real file wins.
 *
 * Environment gating lives in the `dev` base builder over `POLICY[env]`, not
 * here. This file does not know which environment it is in.
 *
 * There is no middleware stack, so the CSRF ordering bug the August review
 * found cannot recur — that guard was mounted after the handlers that return
 * on a match, which left it with no subject at all.
 */

/**
 * The SPA's transport.
 *
 * CSRF is header-based: the plugin requires `x-csrf-token: orpc`, which a
 * cross-site page cannot set without a preflight this surface never grants.
 * Its client pair is SimpleCsrfProtectionLinkPlugin in src/web/lib/orpc.ts —
 * one without the other refuses every call the SPA makes.
 */
const rpcHandler = new RPCHandler(router, {
  interceptors: [telemetryInterceptor] as never,
  plugins: [new SimpleCsrfProtectionHandlerPlugin()],
})

/**
 * Ask each owner whether it answers, in the order the table declares.
 *
 * **The table declares order and ownership; the handlers decide matches.** The
 * oRPC handlers return `matched: false` for anything their router does not
 * own, and that is the signal to try the next entry — testing the prefix here
 * and assuming the owner will answer would hand every Better Auth request to
 * the OpenAPI handler, which would 404 it rather than falling through.
 *
 * Better Auth is the one exception and it is safe: it is a plain fetch handler
 * with no `matched` to report, so its prefix is tested — and `/api/auth/` is
 * first in the table and more specific than `/api`, which
 * tests/repo/dispatch.test.ts asserts can never stop being true.
 */
async function answer(
  owner: (typeof DISPATCH)[number]["owner"],
  prefix: `/${string}`,
  request: Request,
  env: Bindings,
): Promise<Response | null> {
  const context = { env, request }
  if (owner === "better-auth") {
    return new URL(request.url).pathname.startsWith(prefix) ? handleAuth(request, env) : null
  }
  const handler = owner === "orpc-rpc" ? rpcHandler : openApiHandler
  const { matched, response } = await handler.handle(request, { prefix, context })
  return matched ? response : null
}

/**
 * Is this a browser asking for a page?
 *
 * Only a navigation gets the SPA shell when the asset store has nothing. The
 * check is narrow on purpose, because every one of the callers that must NOT
 * get HTML asks for something else: Apple's crawler fetching the association
 * file, a mail client following a link, and the SPA's own `fetch` for a chunk
 * that has been renamed by a deploy. Answering those with a 200 page is worse
 * than a 404 — iOS caches the association file, and a JSON parse of an HTML
 * document is a confusing error a long way from its cause.
 *
 * Four conditions, and all of them must hold: a GET, asking for HTML, with no
 * file extension, outside the prefixes something else owns.
 *
 * `/` is the exception, and it is not a loophole: the root has no competing
 * meaning — nothing else is served there, and it answered the shell
 * unconditionally before this rule existed. A curl or a health probe hitting
 * `/` with no Accept header should get the app, not a 404.
 */
const OWNED = [
  // Association files and anything else the asset store answers by exact path.
  // Not in DISPATCH: nothing in the Worker owns it, and that is the point — a
  // 404 here must stay a 404, because iOS caches what it is given.
  "/.well-known/",
  // Derived, so a prefix added to the table is excluded from the shell the
  // same day rather than the day somebody remembers this list.
  ...DISPATCH.map((entry) => entry.prefix),
]

function isNavigation(request: Request, pathname: string): boolean {
  if (request.method !== "GET") return false
  if (pathname === "/") return true
  const accept = request.headers.get("accept") ?? ""
  const wantsHtml = accept.includes("text/html") || request.headers.get("sec-fetch-dest") === "document"
  if (!wantsHtml) return false
  if (OWNED.some((prefix) => pathname.startsWith(prefix))) return false
  // `/events/abc` is a route; `/assets/main-a1b2.js` is a file that has gone.
  return !/\.[^/]+$/.test(pathname)
}

/**
 * The shell, for a path the SPA routes itself.
 *
 * `not_found_handling = "none"` in wrangler.toml is why this is here rather
 * than a setting: the asset store is told to 404 rather than guess, and this
 * decides which of those 404s is really a page.
 */
const shell = (request: Request, env: Bindings) =>
  env.ASSETS.fetch(new Request(new URL("/index.html", request.url), request))

export default {
  async fetch(request: Request, env: Bindings): Promise<Response> {
    const { pathname } = new URL(request.url)

    for (const { owner, prefix } of DISPATCH) {
      const response = await answer(owner, prefix, request, env)
      if (response) return response
    }

    const asset = await env.ASSETS.fetch(request)
    if (asset.status !== 404) return asset
    return isNavigation(request, pathname) ? shell(request, env) : asset
  },
  scheduled,
  queue,
}

/**
 * Notification fan-out, and the dead letter queue that catches what it cannot
 * do.
 *
 * A thin shell: the decision — what acks, what retries, why — is in
 * `handleNotification`, so it can be driven directly under the Workers Vitest plugin
 * with no queue runtime.
 *
 * `ack`/`retry` per message rather than letting a throw fail the batch:
 * max_batch_size is 1 today, and a throw would still be the wrong instrument.
 * A malformed message must not be retried three times before anyone sees it.
 */
async function queue(
  batch: MessageBatch<unknown>,
  env: Bindings,
): Promise<void> {
  if (batch.queue.endsWith("-dlq")) {
    /**
     * Nothing is retried here. This queue exists so a failure is *visible*, and
     * the way it becomes visible is `notify.dead` beside push.batch — a message
     * rotting unread in a DLQ is "notifications silently stopped", which is the
     * failure class this whole design is trying not to have.
     */
    for (const message of batch.messages) {
      const body = message.body as { typeCode?: unknown } | null
      track(env, "notify.dead", {
        reason: "dead-letter",
        typeCode: typeof body?.typeCode === "string" ? body.typeCode : "",
        attempts: message.attempts,
      })
      message.ack()
    }
    return
  }

  for (const message of batch.messages) {
    const { action } = await handleNotification(env, message.body)
    if (action === "retry") message.retry()
    else message.ack()
  }
}

