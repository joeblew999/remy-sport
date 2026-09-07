import { expect, it } from "vitest"
import { env } from "cloudflare:test"
import { api, post, signIn } from "./helpers"
import { SEED_ENTITIES as E } from "../../src/domain/model/entities"

it("event settings persist translations, validate a timezone and allow dates to be cleared", async () => {
  const cookie = await signIn(E.users.find((u) => u.id === "usr_org_002")!.email)
  const created = await post("/api/events", { names: { en: "Settings test" }, typeCode: "LEAGUE",
    startDate: "2026-09-10", endDate: "2026-09-20" }, cookie)
  expect(created.status).toBe(201)
  const { id } = await created.json() as { id: string }
  const update = (body: unknown) => api(`/api/events/${id}`, { method: "PUT", cookie, body: JSON.stringify(body) })
  expect((await update({ timezone: "made-up-zone" })).status).toBe(400)
  expect((await update({ provinceCode: "NOT_A_PROVINCE" })).status).toBe(400)
  expect((await update({ endDate: "2026-09-01" })).status).toBe(400)
  expect((await update({ names: { en: "Settings test", ja: "設定テスト" }, startDate: null, endDate: null,
    timezone: "Asia/Bangkok", description: "Indoor shoes", isFibaCertified: true })).status).toBe(200)
  expect(await (await api(`/api/events/${id}`)).json()).toMatchObject({ names: { ja: "設定テスト" },
    startDate: null, endDate: null, timezone: "Asia/Bangkok", description: "Indoor shoes", isFibaCertified: true })
  await api(`/api/events/${id}`, { method: "DELETE", cookie })
})

it("a session cannot be deleted using another camp's permission; its attendance is removed with it", async () => {
  const cookie = await signIn(E.users.find((u) => u.id === "usr_org_003")!.email)
  const createCamp = async () => {
    const res = await post("/api/events", { names: { en: "Session boundary test" }, typeCode: "CAMP" }, cookie)
    expect(res.status).toBe(201)
    return (await res.json() as { id: string }).id
  }
  const first = await createCamp(), second = await createCamp()
  const session = await post(`/api/events/${first}/sessions`, { eventId: first, names: { en: "Training" },
    startsAt: "2026-09-21T09:00:00Z", endsAt: "2026-09-21T10:00:00Z" }, cookie)
  expect(session.status).toBe(201)
  const { id } = await session.json() as { id: string }
  await env.DB.prepare('INSERT INTO sessionAttendance (session_id, player_id, recorded_at) VALUES (?, ?, ?)')
    .bind(id, "ply_001", "2026-09-21T09:00:00Z").run()
  expect((await api(`/api/events/${second}/sessions/${id}`, { method: "DELETE", cookie })).status).toBe(404)
  const before = await (await api(`/api/events/${first}/sessions`, { cookie })).json() as { sessions: { id: string }[] }
  expect(before.sessions.map((s) => s.id)).toContain(id)
  expect((await api(`/api/events/${first}/sessions/${id}`, { method: "DELETE", cookie })).status).toBe(200)
  expect(await env.DB.prepare('SELECT session_id FROM sessionAttendance WHERE session_id = ?').bind(id).first()).toBeNull()
  for (const eventId of [first, second]) await api(`/api/events/${eventId}`, { method: "DELETE", cookie })
})

it("publisher configuration requires permission on the requested game", async () => {
  expect((await api("/api/moq/config?role=publish&gameId=gam_002")).status).toBe(401)
  const referee = await signIn("waraporn.j@bat.test")
  expect((await api("/api/moq/config?role=publish&gameId=gam_002", { cookie: referee })).status).toBe(403)
  expect((await api("/api/moq/config?role=publish", { cookie: referee })).status).toBe(403)
  expect((await api("/api/moq/config?role=publish&gameId=gam_003", { cookie: referee })).status).toBe(200)
  expect((await api("/api/moq/config?role=watch")).status).toBe(200)
})
