import { expect, it } from 'vitest'
import { actorFor, api, post, signIn } from './helpers'

type Session = { token: string; userId: string }

async function current(cookie: string): Promise<{ session: Session } | null> {
  const response = await api('/api/auth/get-session', { cookie })
  expect(response.status).toBe(200)
  return response.json()
}

async function sessions(cookie: string): Promise<Session[]> {
  const response = await api('/api/auth/list-sessions', { cookie })
  expect(response.status).toBe(200)
  return response.json()
}

it('revoking one owned session ends that session and preserves the caller', async () => {
  const here = await signIn(actorFor('COACH'))
  const elsewhere = await signIn(actorFor('COACH'))
  const target = (await current(elsewhere))!.session
  expect((await sessions(here)).map((session) => session.token)).toContain(target.token)
  expect((await post('/api/auth/revoke-session', { token: target.token }, here)).status).toBe(200)
  expect(await current(elsewhere)).toBeNull()
  expect(await current(here)).not.toBeNull()
  expect((await sessions(here)).map((session) => session.token)).not.toContain(target.token)
})

it('revoking other sessions preserves the current session and other users', async () => {
  const here = await signIn(actorFor('COACH'))
  const elsewhere = await signIn(actorFor('COACH'))
  const stranger = await signIn(actorFor('ORGANIZER'))
  const own = (await current(here))!.session
  const other = (await current(stranger))!.session
  expect((await sessions(here)).every((session) => session.userId === own.userId)).toBe(true)
  expect((await post('/api/auth/revoke-other-sessions', {}, here)).status).toBe(200)
  expect(await current(elsewhere)).toBeNull()
  expect((await current(here))?.session.token).toBe(own.token)
  expect((await current(stranger))?.session.token).toBe(other.token)
  expect((await sessions(here)).map((session) => session.token)).toEqual([own.token])
})

it('knowing another user session token does not authorize revoking it', async () => {
  const caller = await signIn(actorFor('COACH'))
  const stranger = await signIn(actorFor('ORGANIZER'))
  const target = (await current(stranger))!.session
  // Some auth versions acknowledge an absent owned token; survival is the contract.
  await post('/api/auth/revoke-session', { token: target.token }, caller)
  expect((await current(stranger))?.session.token).toBe(target.token)
  expect((await sessions(caller)).map((session) => session.token)).not.toContain(target.token)
})

it('anonymous callers cannot list or revoke sessions', async () => {
  const cookie = await signIn(actorFor('COACH'))
  const target = (await current(cookie))!.session
  expect((await api('/api/auth/list-sessions')).status).toBe(401)
  expect((await post('/api/auth/revoke-session', { token: target.token })).status).toBe(401)
  expect((await post('/api/auth/revoke-other-sessions', {})).status).toBe(401)
  expect((await current(cookie))?.session.token).toBe(target.token)
})
