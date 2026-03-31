import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import { drizzle } from "drizzle-orm/d1"
import { eq } from "drizzle-orm"
import type { AppEnv } from "../types"
import * as schema from "../db/schema"
import { requirePermission } from "../middleware/require-permission"

const ScoreSchema = z.object({
  id: z.string(),
  matchId: z.string(),
  homeScore: z.number(),
  awayScore: z.number(),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const EnterScoreSchema = z.object({
  matchId: z.string().min(1),
  homeScore: z.number().int().min(0),
  awayScore: z.number().int().min(0),
})

const ErrorSchema = z.object({ error: z.string() })

function serializeScore(row: typeof schema.score.$inferSelect) {
  return {
    id: row.id,
    matchId: row.matchId,
    homeScore: row.homeScore,
    awayScore: row.awayScore,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

const scores = new OpenAPIHono<AppEnv>()

// ── GET /api/scores — public ───────────────────────────────────────────────

const listScoresRoute = createRoute({
  method: "get",
  path: "/api/scores",
  responses: {
    200: {
      description: "List all scores",
      content: { "application/json": { schema: z.object({ scores: z.array(ScoreSchema) }) } },
    },
  },
})

scores.openapi(listScoresRoute, async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const rows = await db.select().from(schema.score).all()
  return c.json({ scores: rows.map(serializeScore) })
})

// ── GET /api/scores/:id — public ──────────────────────────────────────────

const getScoreRoute = createRoute({
  method: "get",
  path: "/api/scores/{id}",
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: "Score details", content: { "application/json": { schema: ScoreSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: ErrorSchema } } },
  },
})

scores.openapi(getScoreRoute, async (c) => {
  const { id } = c.req.valid("param")
  const db = drizzle(c.env.DB, { schema })
  const row = await db.select().from(schema.score).where(eq(schema.score.id, id)).get()
  if (!row) return c.json({ error: "Not found" }, 404)
  return c.json(serializeScore(row), 200)
})

// ── POST /api/scores — requires score:enter ───────────────────────────────

const enterScoreRoute = createRoute({
  method: "post",
  path: "/api/scores",
  request: {
    body: { content: { "application/json": { schema: EnterScoreSchema } } },
  },
  responses: {
    201: { description: "Score entered", content: { "application/json": { schema: ScoreSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ErrorSchema } } },
  },
  security: [{ Session: [] }, { ApiKey: [] }],
  middleware: [requirePermission("score", "enter")] as const,
})

scores.openapi(enterScoreRoute, async (c) => {
  const user = c.get("user")!
  const body = c.req.valid("json" as never) as z.infer<typeof EnterScoreSchema>
  const db = drizzle(c.env.DB, { schema })
  const now = new Date()
  const id = crypto.randomUUID()

  const row = {
    id,
    matchId: body.matchId,
    homeScore: body.homeScore,
    awayScore: body.awayScore,
    createdBy: user.id,
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(schema.score).values(row)

  return c.json(
    { ...row, createdAt: now.toISOString(), updatedAt: now.toISOString() },
    201,
  )
})

export default scores
