import { env } from 'cloudflare:test'
import { expect, it } from 'vitest'
import { api, actorFor, post, signIn } from './helpers'

it('attendance reads and writes require the session to belong to the supplied event', async () => {
  const admin = await signIn(actorFor('ADMIN'))
  const created = await post('/api/events', { names: { en: 'Isolated camp' }, typeCode: 'CAMP' }, admin)
  expect(created.status).toBe(201)
  const { id } = await created.json() as { id: string }
  await env.DB.prepare('INSERT INTO eventPlayer (event_id, player_id, registered_at) VALUES (?, ?, ?)')
    .bind(id, 'ply_001', '2026-09-07').run()
  const before = await env.DB.prepare('SELECT * FROM sessionAttendance WHERE session_id = ?').bind('ses_001').all()
  for (const eventId of [id, 'missing-event']) {
    const read = await api(`/api/events/${eventId}/sessions/ses_001/attendance`, { cookie: admin })
    expect(read.status).toBe(404)
    for (const attended of [true, false]) {
      const write = await api(`/api/events/${eventId}/sessions/ses_001/attendance/ply_001`, {
        method: 'PUT', cookie: admin, body: JSON.stringify({ attended }),
      })
      expect(write.status).toBe(404)
    }
  }
  expect(await env.DB.prepare('SELECT * FROM sessionAttendance WHERE session_id = ?').bind('ses_001').all()).toMatchObject({ results: before.results })
  expect((await api('/api/events/evt_003/sessions/ses_001/attendance', { cookie: admin })).status).toBe(200)
  expect((await api('/api/events/evt_003/sessions/missing-session/attendance', { cookie: admin })).status).toBe(404)
})
