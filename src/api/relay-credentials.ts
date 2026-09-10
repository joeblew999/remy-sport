/** moq-relay 0.14.15 claims; verified by tests/integration/moq-scope.ts. */
export const RELAY_TOKEN_SECONDS = 60

const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
const json = (value: unknown) => encode(new TextEncoder().encode(JSON.stringify(value)))

/** Issuer key stays server-side. Each capability is limited to one game's tree. */
export async function mintRelayToken(jwk: string, gameId: string, role: 'watch' | 'publish', now = Math.floor(Date.now() / 1000), lifetime = RELAY_TOKEN_SECONDS) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(gameId)) throw new Error('Invalid game identifier')
  return mintCapability(jwk, `games/${gameId}`, role === 'publish' ? { put: [''] } : { get: [''] }, now, lifetime)
}

/** Dev meeting experiment: publish one seat and consume the other, outside games. */
export async function mintMeetingToken(jwk: string, room: string, seat: 'a' | 'b', role: 'watch' | 'publish') {
  if (!/^[a-f0-9]{32}$/.test(room)) throw new Error('Invalid room identifier')
  const peer = seat === 'a' ? 'b' : 'a'
  return mintCapability(jwk, `meeting-test/${room}`, role === 'publish' ? { put: [`${seat}.hang`] } : { get: [`${peer}.hang`] })
}

async function mintCapability(jwk: string, root: string, grants: { put?: string[]; get?: string[] }, now = Math.floor(Date.now() / 1000), lifetime = RELAY_TOKEN_SECONDS) {
  const key = JSON.parse(jwk) as JsonWebKey
  if (key.kty !== 'oct' || key.alg !== 'HS256' || !key.k || atob(key.k.replaceAll('-', '+').replaceAll('_', '/')).length < 32) throw new Error('Invalid relay signing key')
  const cryptoKey = await crypto.subtle.importKey('jwk', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const body = `${json({ alg: 'HS256', typ: 'JWT' })}.${json({ root, ...grants, iat: now, exp: now + lifetime })}`
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(body))
  return `${body}.${encode(new Uint8Array(signature))}`
}

/**
 * A real meeting's capability: publish yourself, subscribe to the named peers.
 *
 * Separate from `mintMeetingToken` above, which is the dev two-seat experiment
 * and computes its peer as "the other one of a and b". A meeting has any number
 * of people, so the peers are passed in — they are the participants the caller
 * is entitled to watch, decided by the handler against `meeting_participant`.
 * docs/done/2026-09-09-13-meetings.md.
 */
export async function mintRoomToken(
  jwk: string,
  meetingId: string,
  seat: string,
  role: 'watch' | 'publish',
  peers: string[],
) {
  return mintCapability(
    jwk,
    `meeting/${meetingId}`,
    role === 'publish' ? { put: [`${seat}.hang`] } : { get: peers.map((p) => `${p}.hang`) },
  )
}
