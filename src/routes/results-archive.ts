import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import { drizzle } from "drizzle-orm/d1"
import { eq } from "drizzle-orm"
import type { AppEnv } from "../types"
import * as schema from "../db/schema"

const ResultSchema = z.object({
  matchId: z.string(), eventId: z.string(), status: z.string(),
  homeScore: z.number().nullable(), awayScore: z.number().nullable(),
  completedAt: z.string().nullable(),
})

const resultsArchive = new OpenAPIHono<AppEnv>()

const listRoute = createRoute({
  method: "get", path: "/api/results-archive",
  responses: { 200: { description: "Completed match results", content: { "application/json": { schema: z.object({ results: z.array(ResultSchema) }) } } } },
})

resultsArchive.openapi(listRoute, async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const matches = await db.select().from(schema.match).where(eq(schema.match.status, "completed")).all()
  const scores = await db.select().from(schema.score).all()
  const scoreMap = new Map(scores.map((s) => [s.matchId, s]))

  const results = matches.map((m) => {
    const s = scoreMap.get(m.id)
    return {
      matchId: m.id, eventId: m.eventId, status: m.status,
      homeScore: s?.homeScore ?? null, awayScore: s?.awayScore ?? null,
      completedAt: m.updatedAt.toISOString(),
    }
  })

  return c.json({ results })
})

export default resultsArchive
