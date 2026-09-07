/** One-time bootstrap when MoQ is missing from Cloudflare's token editor. */
import { isDeepStrictEqual } from 'node:util'
import { accountId, fnoxGet, token } from './cloudflare'

const MOQ_WRITE = '2f912625599b434a8df3e4e02d64c7b4'
interface Policy {
  id: string
  effect: 'allow' | 'deny'
  resources: Record<string, unknown>
  permission_groups: { id: string; name?: string }[]
}
interface TokenDetails {
  name: string
  policies: Policy[]
  condition?: unknown
  expires_on?: string
  not_before?: string
  status?: string
}

export function withMoqPermission(current: TokenDetails, account: string): TokenDetails {
  const result = structuredClone(current)
  const resource = `com.cloudflare.api.account.${account}`
  // Never append MoQ to a wildcard policy: only the existing exact account grant.
  const policy = result.policies.find(p => p.effect === 'allow' &&
    Object.keys(p.resources).length === 1 && p.resources[resource] === '*')
  if (!policy) throw new Error('No existing allow policy for this exact account; refusing to broaden another policy.')
  if (!policy.permission_groups.some(p => p.id === MOQ_WRITE)) {
    policy.permission_groups.push({ id: MOQ_WRITE })
  }
  return result
}

function editable(value: TokenDetails): TokenDetails {
  const { name, policies, condition, expires_on, not_before, status } = value
  return { name, policies, ...(condition === undefined ? {} : { condition }),
    ...(expires_on === undefined ? {} : { expires_on }),
    ...(not_before === undefined ? {} : { not_before }), ...(status === undefined ? {} : { status }) }
}

export async function grantMoqPermission(): Promise<void> {
  const credential = token()
  if (!credential) throw new Error('CLOUDFLARE_API_TOKEN is unavailable.')
  const api = async <T>(secret: string, path: string, body?: unknown): Promise<T> => {
    const response = await fetch(`https://api.cloudflare.com/client/v4/user/tokens${path}`, {
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { method: 'PUT', body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(20_000),
    })
    const data = await response.json() as { success: boolean; result: T }
    if (!response.ok || !data.success) throw new Error(`Cloudflare token API HTTP ${response.status}; permission update not verified.`)
    return data.result
  }
  const verified = await api<{ id: string; status: string }>(credential, '/verify')
  if (verified.status !== 'active' || !/^[a-f0-9]{32}$/.test(verified.id)) throw new Error('Configured API token is not active.')
  const path = `/${verified.id}`
  const current = editable(await api<TokenDetails>(credential, path))
  const account = accountId()
  const wanted = withMoqPermission(current, account)
  if (isDeepStrictEqual(wanted, current)) {
    console.log('Configured API token already has MoQ Write for the pinned account.')
    return
  }
  console.log(`Add MoQ Write to token ${JSON.stringify(current.name)} (${verified.id}), account ${account}; preserve other policies, status, expiry and IP restrictions.`)
  const admin = process.env.CLOUDFLARE_TOKEN_ADMIN_TOKEN?.trim() || fnoxGet('CLOUDFLARE_TOKEN_ADMIN_TOKEN')
  if (!admin) throw new Error('Create a separate token using Cloudflare’s Create additional tokens template, then store it with: fnox set --global -p keychain CLOUDFLARE_TOKEN_ADMIN_TOKEN')
  const fresh = editable(await api<TokenDetails>(credential, path))
  if (!isDeepStrictEqual(fresh, current)) throw new Error('Token policy changed during preparation; rerun before updating it.')
  await api<TokenDetails>(admin, path, wanted)
  const after = editable(await api<TokenDetails>(credential, path))
  // Cloudflare fills cosmetic permission names; compare IDs for that field only.
  const normalized = (value: TokenDetails) => ({ ...value,
    policies: value.policies.map(p => ({ ...p, permission_groups: p.permission_groups.map(g => ({ id: g.id })) })) })
  if (!isDeepStrictEqual(normalized(after), normalized(wanted))) {
    throw new Error('Cloudflare returned a different policy after update; inspect it before further changes.')
  }
  console.log('MoQ Write added and policy preservation verified. Run bun run live --provision. The separate bootstrap token can now be revoked in Cloudflare.')
}
