/** Run with bun tests/integration/moq-scope.ts after installing the pinned relay.
 * Ephemeral loopback relay and credentials; no configured service is contacted.
 */
import { strict as assert } from 'node:assert'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { Broadcast, Connection, Path } from '@moq/net'
import { mintRelayToken } from '../../src/api/relay-credentials'

// Upstream network diagnostics include URLs. Test credentials must not enter logs.
console.warn = () => {}
console.debug = () => {}
console.error = () => {}

const dir = mkdtempSync(join(tmpdir(), 'remy-moq-'))
const secret = randomBytes(32)
const base = 'http://127.0.0.1:14443'
const jwk = JSON.stringify({ kty: 'oct', alg: 'HS256', k: secret.toString('base64url') })
const token = (root: string, role: 'watch' | 'publish', seconds = 30) =>
  mintRelayToken(jwk, root.replace('games/', ''), role, Math.floor(Date.now() / 1000), seconds)
writeFileSync(join(dir, 'key.jwk'), JSON.stringify({ kty: 'oct', alg: 'HS256', k: secret.toString('base64url') }), { mode: 0o600 })
writeFileSync(join(dir, 'relay.toml'), `[server]\nbind = "127.0.0.1:14444"\n[server.tls]\ngenerate = ["localhost"]\n[web.http]\nlisten = "127.0.0.1:14443"\n[auth]\nkey = "${join(dir, 'key.jwk')}"\n[log]\nlevel = "error"\n`)
const relay = spawn(process.env.REMY_TEST_RELAY ?? '/tmp/remy-relay-test/bin/moq-relay', [join(dir, 'relay.toml')], { stdio: ['ignore', 'ignore', 'pipe'] })
// Never print relay logs: a diagnostic may contain the capability-bearing URL.
let failure = false
let startupDiagnostic = ''
relay.stderr.on('data', (data) => { startupDiagnostic = String(data).replace(/eyJ[A-Za-z0-9_.-]+/g, '[redacted]') })
relay.on('error', () => { failure = true })
relay.on('exit', () => { failure = true })
const opened: Connection.Established[] = []
const deadline = async <T>(p: PromiseLike<T>, ms = 3000): Promise<T> => {
  let timer: ReturnType<typeof setTimeout>
  try { return await Promise.race([Promise.resolve(p), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('protocol deadline exceeded')), ms) })]) }
  finally { clearTimeout(timer!) }
}
const connect = async (root: string, credential: string | Promise<string>) => {
  const url = new URL(`${base}/${root}`)
  url.searchParams.set('jwt', await credential)
  const c = await Connection.connect(url, { websocket: { delay: 0 }, signal: AbortSignal.timeout(3000) })
  opened.push(c)
  // A connection-level refusal can otherwise become an unhandled rejection.
  void c.closed.catch(() => {})
  return c
}
try {
  for (let i = 0; i < 50; i++) {
    if (failure) throw new Error(`relay failed to start: ${startupDiagnostic}`)
    try { await fetch(base); break } catch { await new Promise((r) => setTimeout(r, 100)) }
  }
  const publishA = await token('games/A', 'publish')
  const watchA = token('games/A', 'watch')
  const publisher = await connect('games/A', publishA)
  const watcher = await connect('games/A', watchA)
  const broadcast = new Broadcast.Producer()
  broadcast.createTrack('probe').writeString('allowed frame')
  publisher.publish(Path.from('A.hang'), broadcast)
  const announced = watcher.announced()
  const announcement = await deadline(announced.next())
  assert.ok(announcement, 'allowed publisher must be visible to the allowed watcher')
  assert.equal(announcement.path, Path.from('A.hang'))
  const allowed = watcher.consume(Path.from('A.hang')).subscribe('probe')
  const group = await deadline(allowed.nextGroup())
  assert.equal(await group?.readString(), 'allowed frame')
  allowed.close()
  console.log('PASS allowed publish/watch data delivery')
  await assert.rejects(connect('games/B', publishA))
  await assert.rejects(connect('games/B', watchA))
  console.log('PASS cross-game connection denial')
  const parts = publishA.split('.')
  parts[1] = Buffer.from(JSON.stringify({ root: 'games/B', put: [''], exp: Math.floor(Date.now() / 1000) + 30 })).toString('base64url')
  await assert.rejects(connect('games/B', parts.join('.')))
  await assert.rejects(connect('games/A', token('games/A', 'publish', -5)))
  console.log('PASS tampering and expired credential denial')
  const illegal = new Broadcast.Producer()
  illegal.createTrack('probe').writeString('must never arrive')
  watcher.publish(Path.from('illegal.hang'), illegal)
  const refused = watcher.consume(Path.from('illegal.hang')).subscribe('probe')
  await assert.rejects(deadline(refused.nextGroup()), (error: unknown) => error instanceof Error && error.message !== 'protocol deadline exceeded')
  refused.close(); illegal.close()
  console.log('PASS subscribe-only publishing denial')
  const short = await connect('games/expiry', token('games/expiry', 'watch', 2))
  await deadline(short.closed.catch(() => {}), 4000)
  console.log('PASS active connection closes at token expiry')
  broadcast.close(); announced.close()
} finally {
  for (const c of opened) c.close()
  relay.kill('SIGTERM')
  rmSync(dir, { recursive: true, force: true })
}
