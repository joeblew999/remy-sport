import { Hono } from "hono"
import { swaggerUI } from "@hono/swagger-ui"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { csrf } from "hono/csrf"
import authRoutes from "./routes/auth"
import seedRoutes from "./routes/seed"
import { RPCHandler } from "@orpc/server/fetch"
import { OpenAPIHandler } from "@orpc/openapi/fetch"
import { OpenAPIGenerator } from "@orpc/openapi"
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4"
import { router } from "./api"
import { scheduled } from "./scheduled"
import { telemetryInterceptor } from "./api/telemetry"
import analyticsRoutes from "./routes/analytics"
import devMailRoutes from "./routes/dev-mail"
import devSessionRoutes from "./routes/dev-sessions"
import wellKnownRoutes from "./routes/well-known"
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

// API routes registered before CSRF — called via curl/scripts/tests
app.route("/", seedRoutes)

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
const api = new OpenAPIHandler(router, { interceptors: intercept })
const rpc = new RPCHandler(router, { interceptors: intercept })
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

// Dev-only: 404s unless the outbox mail transport is active (ADR 010).
app.route("/", analyticsRoutes)
app.route("/", devMailRoutes)
app.route("/", devSessionRoutes)

// Apple/Android deep-link association files. Must be before CSRF — they are
// fetched by Apple's and Google's crawlers, not by a browser session.
app.route("/", wellKnownRoutes)
app.route("/", unsubscribeRoutes)

app.use(csrf())

// Browser routes (CSRF protected)
app.route("/", authRoutes)

// Version metadata, read by the SPA. Lived in routes/home.ts until ADR 020
// deleted the server-rendered harness around it.
app.get("/api/versions", async (c) => {
  try {
    const versions = await import("../versions.json")
    return c.json(versions.default ?? versions)
  } catch {
    return c.json({ error: "versions.json not found — run: mise run versions" }, 404)
  }
})

// OpenAPI spec at /openapi.json, generated from the same router that serves
// the requests — the document cannot describe an endpoint that does not exist.
const openapi = new OpenAPIGenerator({ schemaConverters: [new ZodToJsonSchemaConverter()] })

/**
 * Publish paths under /api, where they are actually served.
 *
 * The contract states paths relative to the handler's prefix, which is right
 * for routing and wrong for a document an integrator reads. Declaring a
 * `servers: [{url: "/api"}]` instead would be equally valid OpenAPI but would
 * change every path in the published spec, and existing clients read these.
 */
const withApiPrefix = async (doc: { paths?: Record<string, unknown> }) => ({
  ...doc,
  paths: Object.fromEntries(Object.entries(doc.paths ?? {}).map(([p, v]) => [`/api${p}`, v])),
})
app.get("/openapi.json", async (c) =>
  c.json(
    await withApiPrefix(
      await openapi.generate(router, {
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
      }),
    ),
  ),
)

// Swagger UI at /doc
app.get("/doc", swaggerUI({ url: "/openapi.json" }))

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
 * `mise run check:authz` enumerates `app.routes` to prove every non-procedure
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
 * `handleNotification`, so it can be driven directly under vitest-pool-workers
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
