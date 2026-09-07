/** moq-relay 0.14.15 claims; verified by tests/integration/moq-scope.ts. */
export const RELAY_TOKEN_SECONDS = 60

const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
const json = (value: unknown) => encode(new TextEncoder().encode(JSON.stringify(value)))

/** Issuer key stays server-side. Each capability is limited to one game's tree. */
export async function mintRelayToken(jwk: string, gameId: string, role: 'watch' | 'publish', now = Math.floor(Date.now() / 1000), lifetime = RELAY_TOKEN_SECONDS) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(gameId)) throw new Error('Invalid game identifier')
  const key = JSON.parse(jwk) as JsonWebKey
  if (key.kty !== 'oct' || key.alg !== 'HS256' || !key.k || atob(key.k.replaceAll('-', '+').replaceAll('_', '/')).length < 32) throw new Error('Invalid relay signing key')
  const cryptoKey = await crypto.subtle.importKey('jwk', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const body = `${json({ alg: 'HS256', typ: 'JWT' })}.${json({ root: `games/${gameId}`, ...(role === 'publish' ? { put: [''] } : { get: [''] }), iat: now, exp: now + lifetime })}`
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(body))
  return `${body}.${encode(new Uint8Array(signature))}`
}
