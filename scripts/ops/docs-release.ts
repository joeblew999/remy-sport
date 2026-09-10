/** Help-only releases. Reuse the team's target and credential resolution. */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import { accountId, originOf, resolveTarget, workerName, wrangler } from '../lib/cloudflare'

const root = resolve(import.meta.dirname, '../..')
const help = join(root, 'sites/help')
const tools = join(root, 'sites/help-tools')
type Run = (args: string[], cwd?: string) => Promise<void>
export interface HelpTarget { environment: string; name: string; origin: string; appOrigin: string; buildId: string; commit: string; contractDigest?: string; appBuildId?: string; versionId?: string; toolsOrigin?: string }
export function helpTarget(environment: string): HelpTarget {
  if (!['dev', 'staging', 'production'].includes(environment)) throw new Error('Unknown help environment')
  const remote = environment === 'dev' ? null : JSON.parse(readFileSync(join(help, 'deployment.json'), 'utf8'))[environment]
  if (remote) {
    const peers = JSON.parse(readFileSync(join(help, 'deployment.json'), 'utf8'))
    if (peers.staging.name === peers.production.name || peers.staging.host === peers.production.host) throw new Error('Help environments must have distinct Workers and hosts')
    for (const name of ['staging', 'production']) {
      const app = resolveTarget(['--env', name])
      if (remote.name === workerName(app) || `https://${remote.host}` === originOf(app)) throw new Error('Help deployment collides with an application Worker or hostname')
    }
  }
  const appOrigin = environment === 'dev' ? 'http://127.0.0.1:8787' : originOf(resolveTarget(['--env', environment]))
  return { environment, toolsOrigin: remote ? `https://${remote.host}` : 'http://127.0.0.1:8792', name: remote?.name ?? 'remy-help-local', origin: remote ? `https://${remote.host}` : 'https://help.remy.invalid', appOrigin, buildId: new Date().toISOString(), commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() }
}
export function writeHelpTarget(target: HelpTarget) {
  for (const dir of [help, tools]) writeFileSync(join(dir, 'deployment.generated.json'), JSON.stringify(target, null, 2))
}
export function validateHelpConfig(config: any, target: HelpTarget) {
  const expected = helpTarget(target.environment)
  if (target.origin !== expected.origin || target.appOrigin !== expected.appOrigin || config.name !== expected.name || config.vars?.ENVIRONMENT !== target.environment || config.vars?.APP_ORIGIN !== expected.appOrigin || config.vars?.HELP_ORIGIN !== expected.origin) throw new Error('Help environment/host/API mismatch')
  if (config.routes?.[0]?.pattern !== new URL(target.origin).hostname || config.workers_dev !== false || config.preview_urls !== false) throw new Error('Unexpected help route or public alias')
  for (const key of ['d1_databases', 'r2_buckets', 'queues', 'services', 'kv_namespaces', 'durable_objects']) if (config[key]) throw new Error(`Help cannot have application bindings: ${key}`)
}
async function status(target: HelpTarget, verbose = true) {
  const served = JSON.parse(execFileSync('node', [join(tools, 'status.mjs'), target.origin], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], timeout: 30000 })) as HelpTarget
  if (served.environment !== target.environment || served.appOrigin !== target.appOrigin || served.origin !== target.origin) throw new Error('Served help is wired to the wrong environment')
  if (verbose) console.log(JSON.stringify(served, null, 2))
  return served
}
export async function releaseHelp(action: string, environment: string, run: Run, env: NodeJS.ProcessEnv) {
  if (environment === 'dev') throw new Error('Use docs dev/check for local work; remote actions require staging or production')
  const target = helpTarget(environment)
  const dir = join(tools, '.proof', environment)
  mkdirSync(dir, { recursive: true })
  const configPath = join(dir, 'wrangler.json')
  if (action === 'status') {
    try { await status(target) } catch (error) {
      const dns = await fetch(`https://dns.google/resolve?name=${new URL(target.origin).hostname}&type=A`, { signal: AbortSignal.timeout(10000) }).then(r => r.json()).catch(() => null)
      console.error('Public DNS diagnostic:', JSON.stringify(dns))
      throw error
    }
    await run(['node', 'discover.mjs', target.appOrigin], tools)
    await run(['node', 'worker-check.mjs', target.origin, environment], tools)
    return
  }
  if (action === 'rollback') {
    const recordPath = join(dir, 'previous.json')
    if (!existsSync(recordPath)) throw new Error('No recorded previous help release; refusing an unreviewable rollback')
    const previous = JSON.parse(readFileSync(recordPath, 'utf8'))
    if (previous.target.environment !== environment || previous.target.appOrigin !== target.appOrigin) throw new Error('Rollback environment mismatch')
    await run(['node', 'discover.mjs', target.appOrigin], tools)
    const result = wrangler(['rollback', previous.versionId, '--name', target.name, '--yes'], undefined, { inherit: true })
    if (result.code) throw new Error('Help rollback failed')
    let restored = false
    for (let n = 0; n < 60; n++) {
      const served = await status(target, false)
      restored = served.buildId === previous.target.buildId && served.versionId === previous.versionId
      if (restored) break
      await new Promise(r => setTimeout(r, 2000))
    }
    if (!restored) throw new Error('Rollback did not restore the recorded help build')
    await run(['node', 'worker-check.mjs', target.origin, environment], tools)
    return
  }
  // Check identity before any data request, build or Cloudflare mutation.
  await run(['node', 'release-contract.mjs', target.appOrigin, dir, environment], tools)
  await run(['node', 'discover.mjs', target.appOrigin], tools)
  writeHelpTarget(target)
  try {
    const verified = JSON.parse(readFileSync(join(dir, 'contract.json'), 'utf8'))
    target.contractDigest = verified.digest
    target.appBuildId = verified.appVersion?._generated
    writeHelpTarget(target)
    rmSync(join(help, 'dist'), { recursive: true, force: true })
    await run([process.execPath, 'run', 'build'], help)
    const assets = join(dir, 'public')
    rmSync(assets, { recursive: true, force: true })
    cpSync(join(help, 'dist/public'), assets, { recursive: true })
    // Worker owns environment headers. Source _headers stays safe for local previews.
    rmSync(join(assets, '_headers'), { force: true })
    const config = { name: target.name, main: join(tools, 'worker.mjs'), compatibility_date: '2026-09-09', compatibility_flags: ['nodejs_compat'], workers_dev: false, preview_urls: false, version_metadata: { binding: 'CF_VERSION_METADATA' }, routes: [{ pattern: new URL(target.origin).hostname, custom_domain: true }], assets: { directory: assets, binding: 'ASSETS', run_worker_first: true, html_handling: 'drop-trailing-slash', not_found_handling: '404-page' }, vars: { ENVIRONMENT: environment, APP_ORIGIN: target.appOrigin, HELP_ORIGIN: target.origin }, ratelimits: [{ name: 'RATE_LIMIT', namespace_id: environment === 'production' ? '1002' : '1001', simple: { limit: 120, period: 60 } }] }
    validateHelpConfig(config, target)
    writeFileSync(configPath, JSON.stringify(config, null, 2))
    const binary = join(help, 'node_modules/wrangler/bin/wrangler.js')
    await run(['node', binary, 'deploy', '--dry-run', '--config', configPath, '--outdir', join(dir, 'bundle')], tools)
    const child = spawn('node', [binary, 'dev', '--local', '--config', configPath, '--port', '8794', '--ip', '127.0.0.1'], { cwd: tools, env, stdio: 'inherit', detached: true })
    try {
      let ready = false
      for (let n = 0; n < 100; n++) {
        if (child.exitCode !== null) throw new Error('Help workerd exited')
        try { ready = (await fetch('http://127.0.0.1:8794/health', { signal: AbortSignal.timeout(1000) })).ok } catch {}
        if (ready) break
        await new Promise(r => setTimeout(r, 200))
      }
      if (!ready) throw new Error('Help workerd did not start')
      await run(['node', 'application-check.mjs', 'http://127.0.0.1:8794'], tools)
      await run(['node', 'worker-check.mjs', 'http://127.0.0.1:8794', environment], tools)
      await run([process.execPath, 'run', 'audit', 'http://127.0.0.1:8794', '--worker'], help)
    } finally {
      if (child.pid) { try { process.kill(-child.pid, 'SIGTERM') } catch {} }
      if (child.exitCode === null && child.signalCode === null) await once(child, 'exit')
    }
    writeFileSync(join(dir, 'checked.json'), JSON.stringify(target, null, 2))
    if (action === 'check') return
    // Resolve credentials only after all local and target checks pass.
    Object.assign(config, { account_id: accountId() })
    writeFileSync(configPath, JSON.stringify(config, null, 2))
    let previous: any
    try { previous = await status(target) } catch (error) {
      // A new hostname may not resolve yet. A responding but wrongly wired
      // Worker is never treated as a first deployment.
      if ((error as Error).message.includes('wrong environment')) throw error
    }
    if (previous) {
      const versionId = previous.versionId
      if (!versionId) throw new Error('Existing help version could not be identified')
      writeFileSync(join(dir, 'previous.json'), JSON.stringify({ target: previous, versionId }, null, 2))
    }
    const published = wrangler(['deploy', '--config', configPath], undefined, { inherit: true })
    if (published.code) throw new Error('Help publish failed')
    let current = false
    for (let n = 0; n < 60; n++) {
      try { current = (await status(target, false)).buildId === target.buildId } catch {}
      if (current) break
      await new Promise(r => setTimeout(r, 2000))
    }
    if (!current) throw new Error('Published help did not report the expected build; inspect previous.json for rollback')
    await run(['node', 'worker-check.mjs', target.origin, environment], tools)
    await run(['node', 'discover.mjs', target.appOrigin, ...(environment === 'production' ? [target.origin] : [])], tools)
    writeFileSync(join(dir, 'deployed.json'), JSON.stringify(target, null, 2))
  } finally { writeHelpTarget(helpTarget('dev')) }
}
