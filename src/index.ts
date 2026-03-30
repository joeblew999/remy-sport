import { OpenAPIHono } from "@hono/zod-openapi"
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

// Global middleware
app.use(logger())
app.use(cors({ origin: "*", credentials: true }))

// API routes registered before CSRF — called via curl/scripts/tests
app.use("*", sessionMiddleware)
app.route("/", seedRoutes)
app.route("/", eventsRoutes)

app.use(csrf())

// Browser routes (CSRF protected)
app.route("/", authRoutes)
app.route("/", homeRoutes)
app.route("/", loginRoutes)
app.route("/", dashboardRoutes)

// OpenAPI documentation
app.doc("/doc", {
  openapi: "3.0.0",
  info: {
    version: "0.1.0",
    title: "Remy Sport API",
  },
})

export default app
