import { OpenAPIHono } from "@hono/zod-openapi"
import { swaggerUI } from "@hono/swagger-ui"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { csrf } from "hono/csrf"
import { sessionMiddleware } from "./middleware/session"
import authRoutes from "./routes/auth"
import homeRoutes from "./routes/home"
import loginRoutes from "./routes/login"
import seedRoutes from "./routes/seed"
import eventsRoutes from "./routes/events"
import dashboardRoutes from "./routes/dashboard"
import wellKnownRoutes from "./routes/well-known"
import type { AppEnv } from "./types"

const app = new OpenAPIHono<AppEnv>()

// Register security schemes — appear in OpenAPI spec and Swagger UI
app.openAPIRegistry.registerComponent("securitySchemes", "Session", {
  type: "http",
  scheme: "bearer",
  description: "Better Auth session token (browser)",
})
app.openAPIRegistry.registerComponent("securitySchemes", "ApiKey", {
  type: "apiKey",
  in: "header",
  name: "x-api-key",
  description: "Better Auth API key (integrations, MCP)",
})

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
app.route("/", eventsRoutes)

// Apple/Android deep-link association files. Must be before CSRF — they are
// fetched by Apple's and Google's crawlers, not by a browser session.
app.route("/", wellKnownRoutes)

app.use(csrf())

// Browser routes (CSRF protected)
app.route("/", authRoutes)
app.route("/", homeRoutes)
app.route("/", loginRoutes)
app.route("/", dashboardRoutes)

// OpenAPI spec at /openapi.json
app.doc("/openapi.json", {
  openapi: "3.0.0",
  info: {
    version: "0.1.0",
    title: "Remy Sport API",
  },
})

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
