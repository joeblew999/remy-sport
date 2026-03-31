import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").unique().notNull(),
  emailVerified: integer("email_verified", { mode: "boolean" }),
  image: text("image"),
  role: text("role").default("user"),
  banned: integer("banned", { mode: "boolean" }).default(false),
  banReason: text("ban_reason"),
  banExpires: integer("ban_expires", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
})

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  token: text("token"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
})

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp" }),
  scope: text("scope"),
  idToken: text("id_token"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
})

export const event = sqliteTable("event", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(), // tournament, league, camp, showcase
  description: text("description"),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
})

export const team = sqliteTable("team", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  eventId: text("event_id")
    .notNull()
    .references(() => event.id),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
})

export const playerProfile = sqliteTable("player_profile", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  position: text("position"),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
})

// Phase 2 — Scores, brackets, fixtures

export const match = sqliteTable("match", {
  id: text("id").primaryKey(),
  eventId: text("event_id")
    .notNull()
    .references(() => event.id),
  homeTeamId: text("home_team_id").references(() => team.id),
  awayTeamId: text("away_team_id").references(() => team.id),
  status: text("status").notNull().default("scheduled"), // scheduled, in_progress, completed
  scheduledAt: integer("scheduled_at", { mode: "timestamp" }),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
})

export const score = sqliteTable("score", {
  id: text("id").primaryKey(),
  matchId: text("match_id")
    .notNull()
    .references(() => match.id),
  homeScore: integer("home_score").notNull().default(0),
  awayScore: integer("away_score").notNull().default(0),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
})

export const bracket = sqliteTable("bracket", {
  id: text("id").primaryKey(),
  eventId: text("event_id")
    .notNull()
    .references(() => event.id),
  name: text("name").notNull(),
  data: text("data"), // JSON bracket structure
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
})

export const fixture = sqliteTable("fixture", {
  id: text("id").primaryKey(),
  eventId: text("event_id")
    .notNull()
    .references(() => event.id),
  name: text("name").notNull(),
  data: text("data"), // JSON fixture schedule
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
})

// Phase 3 — Rosters, courts, attendance

export const roster = sqliteTable("roster", {
  id: text("id").primaryKey(),
  teamId: text("team_id")
    .notNull()
    .references(() => team.id),
  playerId: text("player_id")
    .notNull()
    .references(() => playerProfile.id),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
})

export const court = sqliteTable("court", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  eventId: text("event_id")
    .notNull()
    .references(() => event.id),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
})

export const campSession = sqliteTable("camp_session", {
  id: text("id").primaryKey(),
  eventId: text("event_id")
    .notNull()
    .references(() => event.id),
  name: text("name").notNull(),
  scheduledAt: integer("scheduled_at", { mode: "timestamp" }),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
})

export const attendance = sqliteTable("attendance", {
  id: text("id").primaryKey(),
  campSessionId: text("camp_session_id")
    .notNull()
    .references(() => campSession.id),
  playerId: text("player_id")
    .notNull()
    .references(() => playerProfile.id),
  present: integer("present", { mode: "boolean" }).notNull().default(true),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
})

// Phase 4 — Referee match-scoping

export const matchReferee = sqliteTable("match_referee", {
  id: text("id").primaryKey(),
  matchId: text("match_id")
    .notNull()
    .references(() => match.id),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
})

export const apikey = sqliteTable("apikey", {
  id: text("id").primaryKey(),
  name: text("name"),
  start: text("start"),
  prefix: text("prefix"),
  key: text("key").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  refillInterval: integer("refill_interval"),
  refillAmount: integer("refill_amount"),
  lastRefillAt: integer("last_refill_at", { mode: "timestamp" }),
  enabled: integer("enabled", { mode: "boolean" }).default(true),
  rateLimitEnabled: integer("rate_limit_enabled", { mode: "boolean" }).default(true),
  rateLimitTimeWindow: integer("rate_limit_time_window").default(86400000),
  rateLimitMax: integer("rate_limit_max").default(10),
  requestCount: integer("request_count").default(0),
  remaining: integer("remaining"),
  lastRequest: integer("last_request", { mode: "timestamp" }),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  permissions: text("permissions"),
  metadata: text("metadata"),
})

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
})
