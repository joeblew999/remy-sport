import { beforeEach, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ enabled: false, failDelete: false, session: false, writes: [] as string[] }))
vi.mock('../../scripts/lib/cloudflare.ts', () => ({
  Refused: class Refused extends Error {},
  originOf: () => 'https://staging.example.test',
  wrangler: (args: string[]) => {
    if (args[1] === 'list') return { code: 0, out: JSON.stringify(state.enabled ? [{ name: 'TEST_ADMIN_OTP' }] : []), err: '' }
    state.writes.push(args.join(' '))
    if (args[1] === 'delete' && state.failDelete) return { code: 1, out: '', err: 'unreachable' }
    state.enabled = args[1] === 'put'
    return { code: 0, out: '', err: '' }
  },
}))
vi.mock('@playwright/test', () => ({
  request: {
    newContext: async () => ({
      post: async (path: string) => {
        if (path.endsWith('/sign-out')) state.session = false
        if (path.endsWith('/sign-in/email-otp')) {
          state.session = state.enabled
          return { ok: () => state.enabled, status: () => state.enabled ? 200 : 400, json: async () => ({ code: 'INVALID_OTP' }) }
        }
        return { ok: () => true, status: () => 200 }
      },
      get: async () => ({ ok: () => true, json: async () => state.session ? { session: {} } : null }),
      storageState: async () => ({ cookies: [], origins: [] }),
      dispose: async () => {},
    }),
  },
}))

import { withStagingAccess } from '../../scripts/lib/staging-test-access'
import type { Target } from '../../scripts/lib/cloudflare'
const target = { environment: 'staging', flag: 'staging' } as Target
beforeEach(() => { state.enabled = false; state.failDelete = false; state.session = false; state.writes = [] })

it('restores temporary access after a failing test, propagating the failure', async () => {
  const failure = new Error('deliberately failing browser assertion')
  await expect(withStagingAccess(target, async () => {
    expect(state.enabled).toBe(true)
    expect(state.session).toBe(false)
    throw failure
  })).rejects.toBe(failure)
  expect(state.enabled).toBe(false)
  expect(state.session).toBe(false)
  expect(state.writes).toEqual(['secret put TEST_ADMIN_OTP', 'secret delete TEST_ADMIN_OTP'])
})

it('preserves pre-existing admin access without rewriting its value', async () => {
  state.enabled = true
  await withStagingAccess(target, async () => {})
  expect(state.enabled).toBe(true)
  expect(state.writes).toEqual([])
})

it('fails when cleanup cannot remove the temporary override', async () => {
  await expect(withStagingAccess(target, async () => { state.failDelete = true })).rejects.toThrow('Staging cleanup failed')
})

it('refuses automatic access changes on production', async () => {
  await expect(withStagingAccess({ environment: 'production' } as Target, async () => {})).rejects.toThrow('staging-only')
  expect(state.writes).toEqual([])
})
