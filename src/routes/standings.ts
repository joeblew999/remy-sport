import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import { drizzle } from "drizzle-orm/d1"
import type { AppEnv } from "../types"
import * as schema from "../db/schema"

const StandingSchema = z.object({
  teamId: z.string(), teamName: z.string(), eventId: z.string(),
  wins: z.number(), losses: z.number(), draws: z.number(), points: z.number(),
})

const standings = new OpenAPIHono<AppEnv>()

const listRoute = createRoute({
  method: "get", path: "/api/standings",
  responses: { 200: { description: "Standings", content: { "application/json": { schema: z.object({ standings: z.array(StandingSchema) }) } } } },
})

standings.openapi(listRoute, async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const teams = await db.select().from(schema.team).all()
  const matches = await db.select().from(schema.match).all()
  const scores = await db.select().from(schema.score).all()
  const scoreMap = new Map(scores.map((s) => [s.matchId, s]))

  const teamStats = new Map<string, { wins: number; losses: number; draws: number }>()
  for (const t of teams) teamStats.set(t.id, { wins: 0, losses: 0, draws: 0 })

  for (const m of matches) {
    if (m.status !== "completed") continue
    const s = scoreMap.get(m.id)
    if (!s || !m.homeTeamId || !m.awayTeamId) continue
    const home = teamStats.get(m.homeTeamId)
    const away = teamStats.get(m.awayTeamId)
    if (!home || !away) continue

    if (s.homeScore > s.awayScore) { home.wins++; away.losses++ }
    else if (s.homeScore < s.awayScore) { away.wins++; home.losses++ }
    else { home.draws++; away.draws++ }
  }

  const result = teams.map((t) => {
    const stats = teamStats.get(t.id) || { wins: 0, losses: 0, draws: 0 }
    return {
      teamId: t.id, teamName: t.name, eventId: t.eventId,
      wins: stats.wins, losses: stats.losses, draws: stats.draws,
      points: stats.wins * 3 + stats.draws,
    }
  }).sort((a, b) => b.points - a.points)

  return c.json({ standings: result })
})

export default standings
