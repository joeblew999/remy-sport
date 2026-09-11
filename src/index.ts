import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import authRoutes from "./routes/auth"
import { RPCHandler } from "@orpc/server/fetch"
import { SimpleCsrfProtectionHandlerPlugin } from "@orpc/server/plugins"
import { OpenAPIHandler } from "@orpc/openapi/fetch"
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins"
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4"
import { router } from "./api"
import { scheduled } from "./scheduled"
import { telemetryInterceptor } from "./api/telemetry"
import unsubscribeRoutes from "./api/unsubscribe"
import type { AppEnv } from "./types"
import { handleNotification } from "./api/notify-queue"
import { track } from "./analytics"
import type { Bindings } from "./types"

const app = new Hono<AppEnv>()

// Request logging, scoped to the API rather than mounted on everything.
//
// `run_worker_first = true` plus the catch-all at the bottom of this file means
// every hashed JS and CSS bundle is a Worker invocation, and hono's logger
// writes two console lines per request — so an unscoped `app.use(logger())`
// buried each API call under a page's worth of asset fetches.
//
// Nothing is lost by scoping it. `[observability]` already records method,
// path, status and timing for every invocation, asset requests included, which
// is the same information these lines carry; what they add over it is the local
// `wrangler dev` terminal, and that is API traffic too.
app.use("/api/*", logger())
app.use("/rpc/*", logger())

// CORS applies only to /api/*, and only for anonymous cross-origin reads.
// `origin: "*"` with `credentials: true` is rejected by browsers, so credentials
// are deliberately absent — the GUI is served from this same origin (see the
// [assets] block in wrangler.toml) and therefore needs no CORS at all.
app.use("/api/*", cors({ origin: "*" }))

// No global session middleware. It used to be mounted on "*", so every request
// the Worker saw — including each hashed JS and CSS bundle falling through to
// the asset store — cost a D1 session lookup. `authed` in src/api/base.ts
// resolves the session where it is actually needed.

// ── The API, from one router ────────────────────────────────────────────────
// Events, teams and reference are oRPC procedures. The same `router` object
// produces these HTTP handlers, the OpenAPI document below, and the SPA's
// types — so a shape is declared once and cannot drift between the three.
// Two handlers over one router, which is the oRPC pattern: /api speaks REST
// for external clients and the tests, /rpc speaks oRPC for our own SPA. The
// SPA uses /rpc because an OpenAPI link needs the contract at runtime, and
// importing it would pull server code into the browser bundle.
// One interceptor across both transports, so a failure is recorded once and the
// same way whether it came from the REST surface or the SPA's own.
// Cast because oRPC parameterises an interceptor by the router's whole merged
// context — a type that changes with every middleware — while this reads three
// fields. src/api/telemetry.ts names exactly what it depends on.
const intercept = [telemetryInterceptor] as never
/**
 * The API, its specification and its reference page, from one handler.
 *
 * `/api/openapi.json` is generated from the same router that serves the
 * requests — the document cannot describe an endpoint that does not exist —
 * and `/api/doc` renders it. Both used to be routes of their own beside a
 * Swagger UI package: a second generator call, a function that rewrote every
 * path to say `/api`, and a package whose only job the API library already
 * did. The plugin states the prefix as `servers` instead, which is the same
 * OpenAPI and lets the paths in the document match the paths in the router.
 *
 * Security schemes are declared once here; `authedRoute` in src/api/base.ts
 * says which operations demand them.
 */
const api = new OpenAPIHandler(router, {
  interceptors: intercept,
  plugins: [
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
      specPath: "/openapi.json",
      docsPath: "/doc",
      docsTitle: "Remy Sport API",
      specGenerateOptions: {
        info: { version: "0.1.0", title: "Remy Sport API" },
        components: {
          securitySchemes: {
            Session: {
              type: "http",
              scheme: "bearer",
              description: "Better Auth session token (browser)",
            },
            ApiKey: {
              type: "apiKey",
              in: "header",
              name: "x-api-key",
              description: "Better Auth API key (integrations, MCP)",
            },
          },
        },
      },
    }),
  ],
})
/**
 * The SPA's transport, and the only surface that needs CSRF protection.
 *
 * Header-based: the plugin requires `x-csrf-token: orpc`, which a cross-site
 * page cannot set without a CORS preflight, and `/rpc` grants no CORS. `/api`
 * deliberately does grant it — it is the REST surface for external clients —
 * so the same plugin there would refuse every one of them.
 *
 * This replaces `csrf()`, which never covered `/rpc` at all: the handlers
 * above return before the middleware ran. Its only other target, /api/auth/*,
 * Better Auth already refuses on `trustedOrigins`. See tests/worker/csrf.test.ts.
 */
const rpc = new RPCHandler(router, {
  interceptors: intercept,
  plugins: [new SimpleCsrfProtectionHandlerPlugin()],
})
app.use("/api/*", async (c, next) => {
  const { matched, response } = await api.handle(c.req.raw, {
    prefix: "/api",
    // Headers, not a resolved user: `authed` in src/api/base.ts asks Better
    // Auth for the session, so a public read never touches D1 for one.
    context: { env: c.env, request: c.req.raw },
  })
  return matched ? response : next()
})

app.use("/rpc/*", async (c, next) => {
  const { matched, response } = await rpc.handle(c.req.raw, {
    prefix: "/rpc",
    context: { env: c.env, request: c.req.raw },
  })
  return matched ? response : next()
})

// The deep-link association files are build artefacts now, written into
// dist/client/.well-known by `deepLinkAssociations` in src/web/vite.config.ts
// and served by ASSETS. They were never dynamic: static JSON off four env vars,
// none of which is set in any environment.
app.route("/", unsubscribeRoutes)

// Better Auth owns its own origin checking: it compares the request Origin
// against `trustedOrigins` and refuses with INVALID_ORIGIN. `csrf()` used to
// sit here as a second lock on that door, and covered nothing else — the oRPC
// handlers above return before a middleware mounted here would run, so /rpc
// was never behind it. tests/worker/csrf.test.ts pins both facts.
app.route("/", authRoutes)

// `/api/versions` is `health.versions` in src/api/health.ts — a procedure, so
// it appears in /api/doc and the typed client like everything else. Its URL
// did not change.

// The spec and its reference page moved under the handler that serves the
// API (see the plugin above). The old addresses still arrive somewhere.
app.get("/openapi.json", (c) => c.redirect("/api/openapi.json", 301))
app.get("/doc", (c) => c.redirect("/api/doc", 301))

// ── The GUI (src/web) ───────────────────────────────────────────────────────
// One GUI, served at the root (ADR 020). It used to live at /app while `/`,
// /login and /dashboard were a second, server-rendered one; that harness is
// gone and there is no reason for the product to sit on a sub-path.
//
// No aliases for the old paths. There are no users, so nothing is holding a
// link to /app or /dashboard, and a redirect kept "just in case" is how two
// URLs for one page become permanent.
//
// Hash routing (#/event/e1) means every deep link resolves to this document,
// so no server-side rewrite table is needed. `not_found_handling = "none"` in
// wrangler.toml is why `/` must be handled here rather than falling through to
// the asset store.
const spa = (c: { env: { ASSETS: Fetcher }; req: { url: string; raw: Request } }) =>
  c.env.ASSETS.fetch(new Request(new URL("/index.html", c.req.url), c.req.raw))

app.get("/", spa)

// Hashed JS/CSS bundles and any other static file.
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw))

/**
 * `fetch` and `scheduled`, rather than the Hono app on its own.
 *
 * The app *is* the fetch handler — exporting it directly was correct while
 * every effect in this Worker traced to a request. `EVENT_REMINDER` is the one
 * that cannot: its cause is the passage of time. See src/scheduled.ts for why
 * that file is deliberately the whole of the scheduler.
 */
/**
 * The Hono app by name, as well as inside the default export.
 *
 * `tests/repo/authz.test.ts` enumerates `app.routes` to prove every non-procedure
 * route is accounted for. Wrapping the app in `{ fetch, scheduled }` hid that
 * list behind a closure and the check died with "undefined is not an object" —
 * a security check silently losing its subject, which is the worst way for one
 * to break.
 */
export { app }

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

export default {
  fetch: app.fetch,
  scheduled,
  queue,
}
