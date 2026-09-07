import { env } from 'cloudflare:test'
import { call } from '@orpc/server'
import { expect, it } from 'vitest'
import { config } from '../../src/api/moq'
import type { Bindings } from '../../src/types'
import { signIn } from './helpers'

// Test key only; no application or deployed credential is used.
const signingKey = JSON.stringify({ kty: 'oct', alg: 'HS256', k: btoa('test-only-key-with-at-least-32-bytes').replace(/=+$/, '') })
const configured = { ...env, MOQ_RELAY_URL: 'https://relay.example.test', MOQ_RELAY_SIGNING_KEY: signingKey } as Bindings
const request = (cookie = '') => new Request('https://remy.test/api/moq/config', { headers: { Cookie: cookie } })
const claims = (token: string) => JSON.parse(atob(token.split('.')[1]!.replaceAll('-', '+').replaceAll('_', '/')))

it('the issuer limits publisher and watcher credentials to the requested game and sixty seconds', async () => {
  const referee = await signIn('waraporn.j@bat.test')
  const publish = await call(config, { role: 'publish', gameId: 'gam_003' }, { context: { env: configured, request: request(referee) } })
  expect(publish.url).toBe('https://relay.example.test/games/gam_003')
  expect(claims(publish.token!)).toMatchObject({ root: 'games/gam_003', put: [''] })
  expect(claims(publish.token!).get).toBeUndefined()
  expect(claims(publish.token!).exp - claims(publish.token!).iat).toBe(60)
  const watch = await call(config, { role: 'watch', gameId: 'gam_003' }, { context: { env: configured, request: request() } })
  expect(claims(watch.token!)).toMatchObject({ root: 'games/gam_003', get: [''] })
  expect(claims(watch.token!).put).toBeUndefined()
})

it('renewal rechecks permission, and Cloudflare tokens are not sent to an adapter', async () => {
  const referee = await signIn('waraporn.j@bat.test')
  const context = { env: configured, request: request(referee) }
  await expect(call(config, { role: 'publish', gameId: 'gam_002' }, { context })).rejects.toMatchObject({ code: 'FORBIDDEN' })
  await env.DB.prepare('DELETE FROM gameReferee WHERE game_id = ? AND user_id = ?').bind('gam_003', 'usr_referee_002').run()
  try {
    await expect(call(config, { role: 'publish', gameId: 'gam_003' }, { context })).rejects.toMatchObject({ code: 'FORBIDDEN' })
  } finally {
    await env.DB.prepare('INSERT INTO gameReferee (game_id, user_id) VALUES (?, ?)').bind('gam_003', 'usr_referee_002').run()
  }
  const legacy = { ...configured, MOQ_RELAY_SIGNING_KEY: undefined, MOQ_RELAY_TOKEN: 'must-not-escape', MOQ_RELAY_TOKEN_SUBSCRIBE: 'also-legacy' }
  expect(await call(config, { role: 'watch', gameId: 'gam_003' }, { context: { env: legacy, request: request() } })).toEqual({ url: null, token: null })
})

it('missing games and invalid relay configuration cannot issue capabilities', async () => {
  await expect(call(config, { role: 'watch', gameId: 'missing' }, { context: { env: configured, request: request() } })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  for (const url of ['http://relay.example.test', 'https://relay.example.test/?jwt=unsafe']) {
    await expect(call(config, { role: 'watch', gameId: 'gam_003' }, { context: { env: { ...configured, MOQ_RELAY_URL: url }, request: request() } })).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' })
  }
})

it('serves Cloudflare credentials in dev with the correct role and permission', async () => {
  const cloudflare = { ...env, ENVIRONMENT: 'dev', MOQ_RELAY_URL: 'https://draft-16.cloudflare.mediaoverquic.com', MOQ_RELAY_TOKEN: 'publish-only-test', MOQ_RELAY_TOKEN_SUBSCRIBE: 'watch-only-test', MOQ_RELAY_SIGNING_KEY: undefined } as Bindings
  const referee = await signIn('waraporn.j@bat.test')
  const context = { env: cloudflare, request: request(referee) }
  expect(await call(config, { role: 'publish', gameId: 'gam_003' }, { context })).toEqual({ url: cloudflare.MOQ_RELAY_URL, token: 'publish-only-test' })
  expect(await call(config, { role: 'watch', gameId: 'gam_003' }, { context: { env: cloudflare, request: request() } })).toEqual({ url: cloudflare.MOQ_RELAY_URL, token: 'watch-only-test' })
  await expect(call(config, { role: 'publish', gameId: 'gam_002' }, { context })).rejects.toMatchObject({ code: 'FORBIDDEN' })
  await expect(call(config, { role: 'publish', gameId: 'gam_003' }, { context: { env: cloudflare, request: request() } })).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  expect(await call(config, { role: 'watch', gameId: 'gam_003' }, { context: { env: { ...cloudflare, MOQ_RELAY_TOKEN_SUBSCRIBE: undefined }, request: request() } })).toEqual({ url: null, token: null })
})
