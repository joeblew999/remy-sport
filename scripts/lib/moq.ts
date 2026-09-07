/** Cloudflare control-plane setup. Secrets go only to the caller's local store. */
import { accountApi, accountId } from './cloudflare'

interface RelayToken { jti: string; operations: string[]; expires: string; secret?: string }
interface Issuers { issuers: { type: string; cloudflare_tokens?: RelayToken[] }[] }
interface Relay extends Issuers { uid: string; name: string }
type Api = (path: string, init?: RequestInit) => Promise<Response>
const NAME = 'remy-sport-local'

async function request<T>(api: Api, path: string, body?: unknown): Promise<T> {
  const response = await api(path, {
    ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20_000),
  })
  const data = await response.json().catch(() => null) as {
    success?: boolean; result?: T; errors?: { code?: number }[]
  } | null
  if (!response.ok || !data?.success || data.result === undefined) {
    // API messages and bodies can echo supplied credentials; print codes only.
    const codes = data?.errors?.map(e => e.code).filter(Number.isFinite).join(', ')
    throw new Error(`Cloudflare MoQ HTTP ${response.status}${codes ? ` (code ${codes})` : ''}. ` +
      (response.status === 401 || response.status === 403
        ? 'Edit the CLOUDFLARE_API_TOKEN in https://dash.cloudflare.com/profile/api-tokens: Account → MoQ → Edit (MoQ Write), for the account in wrangler.toml. Preserve existing permissions.'
        : 'Relay setup failed; existing credentials were not deleted.'))
  }
  return data.result
}

export async function checkMoq(api: Api = accountApi): Promise<number> {
  return (await request<Relay[]>(api, '/moq/relays')).length
}

function tokens(value: Issuers): RelayToken[] {
  return value.issuers.filter(i => i.type === 'cloudflare_jwt').flatMap(i => i.cloudflare_tokens ?? [])
}
function roleMatches(token: RelayToken, role: 'publish' | 'subscribe'): boolean {
  return token.operations.includes(role) && (role === 'publish' || !token.operations.includes('publish'))
}
function registered(secret: string | undefined, registry: RelayToken[], role: 'publish' | 'subscribe'): boolean {
  if (!secret) return false
  try {
    // Decode only to match the authoritative registry; this is not JWT verification.
    const { jti } = JSON.parse(Buffer.from(secret.split('.')[1]!, 'base64url').toString())
    return registry.some(t => t.jti === jti && roleMatches(t, role) && Date.parse(t.expires) > Date.now() + 60_000)
  } catch { return false }
}

/** Each minted secret is saved before the next API call, so a partial retry reuses it. */
export async function provisionMoq(
  local: Record<string, string | undefined>,
  save: (values: Record<string, string>) => void,
  api: Api = accountApi,
  account: string = accountId(),
): Promise<string> {
  const relays = await request<Relay[]>(api, '/moq/relays')
  if (local.MOQ_RELAY_ACCOUNT_ID && local.MOQ_RELAY_ACCOUNT_ID !== account) {
    throw new Error('Local relay belongs to another account; refusing to replace its credentials.')
  }
  const matches = relays.filter(r => local.MOQ_RELAY_ID ? r.uid === local.MOQ_RELAY_ID : r.name === NAME)
  if (matches.length > 1) throw new Error('More than one remy-sport-local relay; set MOQ_RELAY_ID explicitly in .dev.vars.')
  if (local.MOQ_RELAY_ID && !matches.length) throw new Error('Configured relay was not found; refusing to create a replacement.')
  let relay = matches[0]
  if (!relay) {
    relay = await request<Relay>(api, '/moq/relays', { name: NAME })
    const fresh: Record<string, string> = { MOQ_RELAY_ID: relay.uid, MOQ_RELAY_ACCOUNT_ID: account }
    for (const t of tokens(relay)) {
      if (!t.secret) continue
      if (roleMatches(t, 'publish')) fresh.MOQ_RELAY_TOKEN = t.secret
      else if (roleMatches(t, 'subscribe')) fresh.MOQ_RELAY_TOKEN_SUBSCRIBE = t.secret
    }
    save(fresh)
    Object.assign(local, fresh)
  } else {
    relay = await request<Relay>(api, `/moq/relays/${relay.uid}`)
    save({ MOQ_RELAY_ID: relay.uid, MOQ_RELAY_ACCOUNT_ID: account })
  }
  const registry = tokens(relay)
  for (const role of ['publish', 'subscribe'] as const) {
    const key = role === 'publish' ? 'MOQ_RELAY_TOKEN' : 'MOQ_RELAY_TOKEN_SUBSCRIBE'
    if (registered(local[key], registry, role)) continue
    const issued = await request<Issuers>(api, `/moq/relays/${relay.uid}/tokens`, {
      operations: role === 'publish' ? ['publish', 'subscribe'] : ['subscribe'],
      expires: new Date(Date.now() + 30 * 86400_000).toISOString(),
      label: `remy-local-${role}`,
    })
    const fresh = tokens(issued).find(t => t.secret && roleMatches(t, role))
    if (!fresh?.secret) throw new Error('Cloudflare did not return the requested one-time relay credential.')
    save({ [key]: fresh.secret })
    local[key] = fresh.secret
    registry.push(fresh)
  }
  return relay.uid
}
