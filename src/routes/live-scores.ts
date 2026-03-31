import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import { drizzle } from "drizzle-orm/d1"
import { eq } from "drizzle-orm"
import type { AppEnv } from "../types"
import * as schema from "../db/schema"

const LiveScoreSchema = z.object({
  matchId: z.string(), eventId: z.string(), status: z.string(),
  homeScore: z.number().nullable(), awayScore: z.number().nullable(),
  updatedAt: z.string(),
})

const liveScores = new OpenAPIHono<AppEnv>()

const listRoute = createRoute({
  method: "get", path: "/api/live-scores",
  responses: { 200: { description: "Live scores for in-progress matches", content: { "application/json": { schema: z.object({ liveScores: z.array(LiveScoreSchema) }) } } } },
})

liveScores.openapi(listRoute, async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const matches = await db.select().from(schema.match).where(eq(schema.match.status, "in_progress")).all()
  const scores = await db.select().from(schema.score).all()
  const scoreMap = new Map(scores.map((s) => [s.matchId, s]))

  const result = matches.map((m) => {
    const s = scoreMap.get(m.id)
    return {
      matchId: m.id, eventId: m.eventId, status: m.status,
      homeScore: s?.homeScore ?? null, awayScore: s?.awayScore ?? null,
      updatedAt: m.updatedAt.toISOString(),
    }
  })

  return c.json({ liveScores: result })
})

export default liveScores
