import { OpenAPIHono } from "@hono/zod-openapi"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { csrf } from "hono/csrf"
import { sessionMiddleware } from "./middleware/session"
import authRoutes from "./routes/auth"
import homeRoutes from "./routes/home"
import loginRoutes from "./routes/login"
import seedRoutes from "./routes/seed"
import type { AppEnv } from "./types"

const app = new OpenAPIHono<AppEnv>()

// Global middleware
app.use(logger())
app.use(cors({ origin: "*", credentials: true }))

// Seed route registered before CSRF — called via curl/scripts, not browsers
app.route("/", seedRoutes)

app.use(csrf())
app.use("*", sessionMiddleware)

// Routes
app.route("/", authRoutes)
app.route("/", homeRoutes)
app.route("/", loginRoutes)

// OpenAPI documentation
app.doc("/doc", {
  openapi: "3.0.0",
  info: {
    version: "0.1.0",
    title: "Remy Sport API",
  },
})

export default app
