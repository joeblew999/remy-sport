import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import { drizzle } from "drizzle-orm/d1"
import type { AppEnv } from "../types"
import * as schema from "../db/schema"

const PlayerStatSchema = z.object({
  playerId: z.string(), playerName: z.string(),
  gamesPlayed: z.number(), totalPoints: z.number(),
})

const playerStats = new OpenAPIHono<AppEnv>()

const listRoute = createRoute({
  method: "get", path: "/api/player-stats",
  responses: { 200: { description: "Player statistics", content: { "application/json": { schema: z.object({ stats: z.array(PlayerStatSchema) }) } } } },
})

playerStats.openapi(listRoute, async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const players = await db.select().from(schema.playerProfile).all()
  const rosters = await db.select().from(schema.roster).all()
  const matches = await db.select().from(schema.match).all()
  const scores = await db.select().from(schema.score).all()

  // Map player → teams
  const playerTeams = new Map<string, Set<string>>()
  for (const r of rosters) {
    if (!playerTeams.has(r.playerId)) playerTeams.set(r.playerId, new Set())
    playerTeams.get(r.playerId)!.add(r.teamId)
  }

  // Count games and points per player via team participation
  const scoreMap = new Map(scores.map((s) => [s.matchId, s]))
  const playerGames = new Map<string, number>()
  const playerPoints = new Map<string, number>()

  for (const m of matches) {
    if (m.status !== "completed") continue
    const s = scoreMap.get(m.id)
    if (!s) continue

    for (const [playerId, teams] of playerTeams) {
      if (m.homeTeamId && teams.has(m.homeTeamId)) {
        playerGames.set(playerId, (playerGames.get(playerId) || 0) + 1)
        playerPoints.set(playerId, (playerPoints.get(playerId) || 0) + s.homeScore)
      } else if (m.awayTeamId && teams.has(m.awayTeamId)) {
        playerGames.set(playerId, (playerGames.get(playerId) || 0) + 1)
        playerPoints.set(playerId, (playerPoints.get(playerId) || 0) + s.awayScore)
      }
    }
  }

  const stats = players.map((p) => ({
    playerId: p.id, playerName: p.name,
    gamesPlayed: playerGames.get(p.id) || 0,
    totalPoints: playerPoints.get(p.id) || 0,
  }))

  return c.json({ stats })
})

export default playerStats
