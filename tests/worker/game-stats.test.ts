import { expect, it } from "vitest"
import { env } from "cloudflare:test"
import { api, actorFor, post, signIn } from "./helpers"

it("the assigned scorer records, corrects and clears a player's line; strangers cannot", async () => {
  const scorer = await signIn("adisorn.b@bat.test")
  const list = await api("/api/games/gam_002/stats", { cookie: scorer })
  expect(list.status).toBe(200)
  const { players } = await list.json() as { players: { playerId: string }[] }
  expect(players.length).toBeGreaterThan(0)
  const playerId = players[0]!.playerId
  const body = { points: 0, rebounds: 2, assists: null, fouls: 1 }
  const write = (values: unknown, cookie: string, who = playerId) => api(`/api/games/gam_002/stats/${who}`, {
    method: "PUT", cookie, body: JSON.stringify(values),
  })
  const spectator = await signIn(actorFor("SPECTATOR"))
  expect((await api("/api/games/gam_002/stats")).status).toBe(401)
  expect((await write(body, spectator)).status).toBe(403)
  expect((await write(body, scorer, "ply_not_on_this_squad")).status).toBe(404)
  expect((await write({ ...body, points: -1 }, scorer)).status).toBe(400)
  expect((await write({ ...body, fouls: 1.5 }, scorer)).status).toBe(400)
  expect((await write(body, scorer)).status).toBe(200)
  const read = async () => await (await api(`/api/players/${playerId}/stats`, { cookie: scorer })).json() as {
    lines: { gameId: string; points: number | null; assists: number | null }[]
  }
  expect((await read()).lines.find((l) => l.gameId === "gam_002")).toMatchObject({ points: 0, assists: null })
  expect((await write({ ...body, points: 12 }, scorer)).status).toBe(200)
  expect((await read()).lines.filter((l) => l.gameId === "gam_002")).toHaveLength(1)
  expect((await read()).lines.find((l) => l.gameId === "gam_002")?.points).toBe(12)
  expect((await write({ points: null, rebounds: null, assists: null, fouls: null }, scorer)).status).toBe(200)
  expect((await read()).lines.some((l) => l.gameId === "gam_002")).toBe(false)
})

it("roster eligibility uses the event's local day across UTC midnight", async () => {
  const owner = await signIn("niran.w@bsbl.test")
  const created = await post("/api/events/evt_002/games", {
    eventId: "evt_002", homeTeamId: "team_001", awayTeamId: "team_003",
    // September 22 in Bangkok, still September 21 in UTC.
    startsAt: "2026-09-21T18:00:00Z",
  }, owner)
  expect(created.status).toBe(201)
  const { id } = await created.json() as { id: string }
  const original = await env.DB.prepare('SELECT from_date FROM playerTeam WHERE player_id = ? AND team_id = ?')
    .bind("ply_001", "team_001").first() as { from_date: string } | null
  expect(original).not.toBeNull()
  try {
    await env.DB.prepare('UPDATE playerTeam SET from_date = ? WHERE player_id = ? AND team_id = ?')
      .bind("2026-09-22", "ply_001", "team_001").run()
    const result = await (await api(`/api/games/${id}/stats`, { cookie: owner })).json() as { players: { playerId: string }[] }
    expect(result.players.map((p) => p.playerId)).toContain("ply_001")
  } finally {
    await env.DB.prepare('UPDATE playerTeam SET from_date = ? WHERE player_id = ? AND team_id = ?')
      .bind(original!.from_date, "ply_001", "team_001").run()
    await api(`/api/events/evt_002/games/${id}`, { method: "DELETE", cookie: owner })
  }
})
