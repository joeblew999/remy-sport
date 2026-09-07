import { env } from "cloudflare:test"
import { expect, it } from "vitest"
import { SEED_ENTITIES as E } from "../../src/domain/model/entities"
import { api, post, signIn } from "./helpers"

it("a fixture cannot be edited or deleted through another event, including its dependants", async () => {
  const owner = await signIn(E.users.find((u) => u.id === "usr_org_002")!.email)
  const created = await post("/api/events/evt_002/games", {
    eventId: "evt_002", homeTeamId: "team_001", awayTeamId: "team_003",
    startsAt: "2026-09-21T10:00:00Z",
  }, owner)
  expect(created.status).toBe(201)
  const { id } = await created.json() as { id: string }
  await post(`/api/games/${id}/referees`, { id, userId: "usr_referee_001" }, owner)
  await api(`/api/games/${id}/broadcast`, { method: "PUT", cookie: owner, body: JSON.stringify({ id }) })
  await env.DB.prepare('INSERT INTO playerGameStat (game_id, player_id, points) VALUES (?, ?, ?)')
    .bind(id, "ply_001", 12).run()
  const before = await (await api(`/api/games/${id}`)).json()

  // This owner is also an accepted co-organiser of evt_001. Permission on that
  // event must not authorize this game's id, even if they own the real parent.
  for (const [method, body] of [
    ["PUT", { startsAt: "2027-01-01T00:00:00Z" }],
    ["PUT", {}],
    ["DELETE", {}],
  ] as const) {
    const res = await api(`/api/events/evt_001/games/${id}`, {
      method, cookie: owner, body: JSON.stringify(body),
    })
    expect(res.status, method).toBe(404)
    expect(await (await api(`/api/games/${id}`)).json()).toEqual(before)
  }
  expect((await api(`/api/events/evt_002/games/${id}`, { method: "DELETE", cookie: owner })).status).toBe(200)
  expect((await api(`/api/games/${id}`)).status).toBe(404)
  for (const table of ["gameReferee", "playerGameStat", "gameBroadcast"]) {
    const result = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE game_id = ?`).bind(id).first() as { n: number }
    expect(result?.n, table).toBe(0)
  }
})
