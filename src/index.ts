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
import teamsRoutes from "./routes/teams"
import playersRoutes from "./routes/players"
import matchesRoutes from "./routes/matches"
import scoresRoutes from "./routes/scores"
import bracketsRoutes from "./routes/brackets"
import fixturesRoutes from "./routes/fixtures"
import rostersRoutes from "./routes/rosters"
import courtsRoutes from "./routes/courts"
import sessionsRoutes from "./routes/sessions"
import attendanceRoutes from "./routes/attendance"
import matchRefereesRoutes from "./routes/match-referees"
import usersRoutes from "./routes/users"
import permissionsRoutes from "./routes/permissions"
import dashboardRoutes from "./routes/dashboard"
import divisionsRoutes from "./routes/divisions"
import registrationsRoutes from "./routes/registrations"
import findTeamRoutes from "./routes/find-team"
import consolationBracketsRoutes from "./routes/consolation-brackets"
import resultsArchiveRoutes from "./routes/results-archive"
import spoilerRoutes from "./routes/spoiler"
import standingsRoutes from "./routes/standings"
import playerStatsRoutes from "./routes/player-stats"
import seasonRecordsRoutes from "./routes/season-records"
import liveScoresRoutes from "./routes/live-scores"
import notificationsRoutes from "./routes/notifications"
import liveStreamsRoutes from "./routes/live-streams"
import courtStatusRoutes from "./routes/court-status"
import aiAssistantRoutes from "./routes/ai-assistant"
import moderationRoutes from "./routes/moderation"
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
app.route("/", teamsRoutes)
app.route("/", playersRoutes)
app.route("/", matchesRoutes)
app.route("/", scoresRoutes)
app.route("/", bracketsRoutes)
app.route("/", fixturesRoutes)
app.route("/", rostersRoutes)
app.route("/", courtsRoutes)
app.route("/", sessionsRoutes)
app.route("/", attendanceRoutes)
app.route("/", matchRefereesRoutes)
app.route("/", usersRoutes)
app.route("/", permissionsRoutes)
app.route("/", divisionsRoutes)
app.route("/", registrationsRoutes)
app.route("/", findTeamRoutes)
app.route("/", consolationBracketsRoutes)
app.route("/", resultsArchiveRoutes)
app.route("/", spoilerRoutes)
app.route("/", standingsRoutes)
app.route("/", playerStatsRoutes)
app.route("/", seasonRecordsRoutes)
app.route("/", liveScoresRoutes)
app.route("/", notificationsRoutes)
app.route("/", liveStreamsRoutes)
app.route("/", courtStatusRoutes)
app.route("/", aiAssistantRoutes)
app.route("/", moderationRoutes)

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
