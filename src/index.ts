import { Hono } from "hono"
import { swaggerUI } from "@hono/swagger-ui"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { csrf } from "hono/csrf"
import { sessionMiddleware } from "./middleware/session"
import authRoutes from "./routes/auth"
import homeRoutes from "./routes/home"
import loginRoutes from "./routes/login"
import seedRoutes from "./routes/seed"
import { RPCHandler } from "@orpc/server/fetch"
import { OpenAPIHandler } from "@orpc/openapi/fetch"
import { OpenAPIGenerator } from "@orpc/openapi"
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4"
import { router } from "./api"
import devMailRoutes from "./routes/dev-mail"
import devSessionRoutes from "./routes/dev-sessions"
import dashboardRoutes from "./routes/dashboard"
import wellKnownRoutes from "./routes/well-known"
import type { AppEnv } from "./types"

const app = new Hono<AppEnv>()

// Global middleware
app.use(logger())

// CORS applies only to /api/*, and only for anonymous cross-origin reads.
// `origin: "*"` with `credentials: true` is rejected by browsers, so credentials
// are deliberately absent — the GUI is served from this same origin (see the
// [assets] block in wrangler.toml) and therefore needs no CORS at all.
app.use("/api/*", cors({ origin: "*" }))

// Session middleware — resolves session before all routes
app.use("*", sessionMiddleware)

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
const api = new OpenAPIHandler(router)
const rpc = new RPCHandler(router)
app.use("/api/*", async (c, next) => {
  const { matched, response } = await api.handle(c.req.raw, {
    prefix: "/api",
    // The session middleware has already resolved the user; oRPC middleware
    // reads it from here (see src/api/base.ts).
    context: { env: c.env, user: c.get("user") ?? null },
  })
  return matched ? response : next()
})

app.use("/rpc/*", async (c, next) => {
  const { matched, response } = await rpc.handle(c.req.raw, {
    prefix: "/rpc",
    context: { env: c.env, user: c.get("user") ?? null },
  })
  return matched ? response : next()
})

// Dev-only: 404s unless the outbox mail transport is active (ADR 010).
app.route("/", devMailRoutes)
app.route("/", devSessionRoutes)

// Apple/Android deep-link association files. Must be before CSRF — they are
// fetched by Apple's and Google's crawlers, not by a browser session.
app.route("/", wellKnownRoutes)

app.use(csrf())

// Browser routes (CSRF protected)
app.route("/", authRoutes)
app.route("/", homeRoutes)
app.route("/", loginRoutes)
app.route("/", dashboardRoutes)

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

// ── SPA (src/web) ───────────────────────────────────────────────────────────
// Served from this Worker at /app so the GUI and API share one origin.
// The SPA uses hash routing (#/event/e1), so every deep link resolves to
// /app itself — no server-side rewrite table needed.
app.get("/app", (c) =>
  c.env.ASSETS.fetch(new Request(new URL("/index.html", c.req.url), c.req.raw)),
)

// Hashed JS/CSS bundles and any other static file.
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw))

export default app
