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
app.use(cors({ origin: "*", credentials: true }))

// Session middleware — resolves session before all routes
app.use("*", sessionMiddleware)

// API routes registered before CSRF — called via curl/scripts/tests
app.route("/", seedRoutes)
app.route("/", eventsRoutes)

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

export default app
