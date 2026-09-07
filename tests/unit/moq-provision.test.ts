import { describe, expect, it, vi } from 'vitest'
import { checkMoq, provisionMoq } from '../../scripts/lib/moq'

const credential = (jti: string) => `header.${Buffer.from(JSON.stringify({ jti })).toString('base64url')}.signature`
const pub = { jti: 'pub', operations: ['publish', 'subscribe'], expires: '2099-01-01T00:00:00Z', secret: credential('pub') }
const sub = { jti: 'sub', operations: ['subscribe'], expires: pub.expires, secret: credential('sub') }
const collection = (items: unknown[]) => ({ issuers: [{ type: 'cloudflare_jwt', cloudflare_tokens: items }] })
const relay = (items: unknown[]) => ({ uid: 'relay1', name: 'remy-sport-local', ...collection(items) })
const ok = (result: unknown) => Response.json({ success: true, result })
const refused = () => Response.json({ success: false, errors: [{ code: 10000, message: 'sensitive-response' }] }, { status: 403 })

describe('Cloudflare relay provisioning', () => {
  it('refused listing never creates a relay or writes local configuration and explains the permission', async () => {
    const api = vi.fn(async () => refused())
    const save = vi.fn()
    await expect(provisionMoq({}, save, api, 'account')).rejects.toThrow('needs MoQ Write')
    expect(api).toHaveBeenCalledTimes(1)
    expect(save).not.toHaveBeenCalled()
    await expect(checkMoq(api)).rejects.not.toThrow('sensitive-response')
  })

  it('stores both one-time defaults on creation and reuses them without minting again', async () => {
    const local: Record<string, string> = {}
    const save = (values: Record<string, string>) => Object.assign(local, values)
    const api = vi.fn().mockResolvedValueOnce(ok([])).mockResolvedValueOnce(ok(relay([pub, sub])))
    await provisionMoq(local, save, api, 'account')
    expect(api).toHaveBeenCalledTimes(2)
    expect(local.MOQ_RELAY_TOKEN).toBe(pub.secret)
    expect(local.MOQ_RELAY_TOKEN_SUBSCRIBE).toBe(sub.secret)
    const metadata = [pub, sub].map(({ secret: _, ...item }) => item)
    const retry = vi.fn().mockResolvedValueOnce(ok([relay(metadata)])).mockResolvedValueOnce(ok(relay(metadata)))
    await provisionMoq(local, save, retry, 'account')
    expect(retry).toHaveBeenCalledTimes(2)
    expect(retry.mock.calls.every(call => call[1]?.method === undefined)).toBe(true)
  })

  it('preserves a minted publisher when watcher creation fails and resumes only the watcher', async () => {
    const local: Record<string, string> = {}
    const save = (values: Record<string, string>) => Object.assign(local, values)
    const api = vi.fn().mockResolvedValueOnce(ok([relay([])])).mockResolvedValueOnce(ok(relay([])))
      .mockResolvedValueOnce(ok(collection([pub]))).mockResolvedValueOnce(refused())
    await expect(provisionMoq(local, save, api, 'account')).rejects.toThrow('403')
    expect(local.MOQ_RELAY_TOKEN).toBe(pub.secret)
    expect(local.MOQ_RELAY_TOKEN_SUBSCRIBE).toBeUndefined()
    const retry = vi.fn().mockResolvedValueOnce(ok([relay([pub])])).mockResolvedValueOnce(ok(relay([pub])))
      .mockResolvedValueOnce(ok(collection([sub])))
    await provisionMoq(local, save, retry, 'account')
    expect(retry).toHaveBeenCalledTimes(3)
    expect(JSON.parse(retry.mock.calls[2]![1].body).operations).toEqual(['subscribe'])
  })

  it('replaces an expired publisher and refuses to reuse a publishing token for watchers', async () => {
    const local = { MOQ_RELAY_TOKEN: pub.secret, MOQ_RELAY_TOKEN_SUBSCRIBE: pub.secret }
    const expired = { ...pub, expires: '2000-01-01T00:00:00Z' }
    const api = vi.fn().mockResolvedValueOnce(ok([relay([expired])])).mockResolvedValueOnce(ok(relay([expired])))
      .mockResolvedValueOnce(ok(collection([pub]))).mockResolvedValueOnce(ok(collection([sub])))
    await provisionMoq(local, values => Object.assign(local, values), api, 'account')
    expect(api).toHaveBeenCalledTimes(4)
    expect(local.MOQ_RELAY_TOKEN_SUBSCRIBE).toBe(sub.secret)
  })

  it('refuses ambiguous names, missing pinned relays and another account without writes', async () => {
    for (const [local, existing] of [
      [{}, [relay([]), relay([])]],
      [{ MOQ_RELAY_ID: 'missing' }, [relay([])]],
      [{ MOQ_RELAY_ACCOUNT_ID: 'different' }, []],
    ] as const) {
      const api = vi.fn(async () => ok(existing))
      const save = vi.fn()
      await expect(provisionMoq({ ...local }, save, api, 'account')).rejects.toThrow()
      expect(api).toHaveBeenCalledTimes(1)
      expect(save).not.toHaveBeenCalled()
    }
  })
})
