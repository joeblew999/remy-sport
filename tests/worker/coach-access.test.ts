import { env } from "cloudflare:test"
import { afterEach, expect, it } from "vitest"
import { database } from "../../src/api/base"
import { heldAmong, holds, objectsHeldBy, usersHolding } from "../../src/api/relations"
import { api, signIn } from "./helpers"
import { SEED_ENTITIES, SEED_RELATIONSHIPS } from "../../src/domain/model/entities"

const email = (id: string) => SEED_ENTITIES.users.find((u) => u.id === id)!.email

// The Worker fixture is shared within this file; restore even on assertion failure.
afterEach(async () => {
  for (const coach of SEED_RELATIONSHIPS.teamCoaches.filter((c) => c.userId === 'usr_coach_001')) {
    await env.DB.prepare('INSERT INTO teamCoach (team_id, user_id, coach_role_code) VALUES (?, ?, ?) ON CONFLICT(team_id, user_id) DO UPDATE SET coach_role_code = excluded.coach_role_code')
      .bind(coach.teamId, coach.userId, coach.coachRoleCode).run()
  }
  const spell = SEED_RELATIONSHIPS.playerTeams.find((p) => p.playerId === 'ply_001' && p.teamId === 'team_001')!
  await env.DB.prepare('UPDATE playerTeam SET from_date = ?, to_date = ? WHERE player_id = ? AND team_id = ?')
    .bind(spell.fromDate, spell.toDate, spell.playerId, spell.teamId).run()
  await env.DB.prepare('UPDATE player SET jersey_number = ? WHERE id = ?')
    .bind(SEED_ENTITIES.players.find((p) => p.id === 'ply_001')!.jerseyNumber, 'ply_001').run()
})

it("current head and assistant coaches edit their player; unrelated coaches and managers do not", async () => {
  const update = async (user: string) => api('/api/players/ply_001', {
    method: 'PUT', cookie: await signIn(email(user)), body: JSON.stringify({ jerseyNumber: 17 }),
  })
  expect((await update('usr_coach_001')).status).toBe(200)
  expect((await update('usr_coach_002')).status).toBe(200)
  expect((await update('usr_coach_003')).status).toBe(403)
  await env.DB.prepare('UPDATE teamCoach SET coach_role_code = ? WHERE user_id = ?')
    .bind('MANAGER', 'usr_coach_001').run()
  expect((await update('usr_coach_001')).status).toBe(403)
})

it("every resolver direction respects start/end dates and any qualifying squad", async () => {
  const db = database(env)
  const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10)
  const actor = { id: 'usr_coach_001', role: null }
  const relation = 'PLAYER_HEAD_COACH'
  await env.DB.prepare('DELETE FROM teamCoach WHERE team_id = ? AND user_id = ?').bind('team_004', actor.id).run()
  const assertAccess = async (expected: boolean) => {
    expect(await holds(db, relation, actor, 'ply_001')).toBe(expected)
    expect((await heldAmong(db, relation, actor, ['ply_001'])).has('ply_001')).toBe(expected)
    expect((await objectsHeldBy(db, relation, actor.id)).includes('ply_001')).toBe(expected)
    expect((await usersHolding(db, relation, 'ply_001')).includes(actor.id)).toBe(expected)
  }
  const dates = async (from: string, to: string | null) => env.DB.prepare(
    'UPDATE playerTeam SET from_date = ?, to_date = ? WHERE player_id = ? AND team_id = ?',
  ).bind(from, to, 'ply_001', 'team_001').run()
  await dates(day(1), null)
  await assertAccess(false)
  await dates(day(-10), day(-1))
  await assertAccess(false)
  await dates(day(0), day(0))
  await assertAccess(true)
  // The first spell is expired, but a different current team also has this coach.
  await dates(day(-10), day(-1))
  await env.DB.prepare('INSERT INTO teamCoach (team_id, user_id, coach_role_code) VALUES (?, ?, ?)')
    .bind('team_004', actor.id, 'HEAD').run()
  await assertAccess(true)
  await env.DB.prepare('DELETE FROM teamCoach WHERE team_id = ? AND user_id = ?').bind('team_004', actor.id).run()
  await assertAccess(false)
})

it("coaching a camp attendee does not authorize attendance", async () => {
  const coach = await signIn(email('usr_coach_001'))
  const response = await api('/api/events/evt_003/sessions/ses_001/attendance/ply_001', {
    method: 'PUT', cookie: coach, body: JSON.stringify({ attended: true }),
  })
  expect(response.status).toBe(403)
})
