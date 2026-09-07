/** Configure local development to use Cloudflare MoQ. No local relay is needed. */
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { fnoxGet } from './lib/cloudflare'
import { grantMoqPermission } from './lib/moq-permission'
import { checkMoq, provisionMoq } from './lib/moq'
import { CLOUDFLARE_MOQ_ORIGIN } from '../src/moq-relay'

const args = process.argv.slice(2)
if (args.some(arg => !['--check', '--provision', '--grant-moq'].includes(arg)) || args.length > 1) {
  throw new Error('Usage: bun run live [--check | --provision | --grant-moq]')
}
if (args.includes('--grant-moq')) {
  try { await grantMoqPermission() }
  catch (error) {
    console.error(error instanceof Error ? error.message : 'Cloudflare permission update failed')
    process.exit(1)
  }
  process.exit(0)
}
if (args.includes('--check')) {
  try {
    const count = await checkMoq()
    console.log(`Cloudflare MoQ API accessible: ${count} relay(s). This checks listing access, not publishing or media delivery.`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Cloudflare MoQ check failed')
    process.exit(1)
  }
  process.exit(0)
}
if (!existsSync('.dev.vars')) throw new Error('Run bun run setup first to create .dev.vars')
let current = readFileSync('.dev.vars', 'utf8')
const local = parseEnv(current)
// Keep one-time secrets after every successful operation, even if the next fails.
const save = (values: Record<string, string>) => {
  current = readFileSync('.dev.vars', 'utf8')
  const lines = current.split('\n').filter(line => !Object.hasOwn(values, line.split('=')[0]!.trim()))
  chmodSync('.dev.vars', 0o600)
  writeFileSync('.dev.vars', `${lines.join('\n').trimEnd()}\n${Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n')}\n`)
  Object.assign(local, values)
  current = readFileSync('.dev.vars', 'utf8')
}
if (args.includes('--provision')) {
  try {
    const id = await provisionMoq(local, save)
    console.log(`Cloudflare relay ${id} provisioned for local development.`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Cloudflare MoQ provisioning failed')
    process.exit(1)
  }
}
const names = ['MOQ_RELAY_TOKEN', 'MOQ_RELAY_TOKEN_SUBSCRIBE'] as const
const values: Record<string, string> = { MOQ_RELAY_URL: CLOUDFLARE_MOQ_ORIGIN }
for (const name of names) {
  const value = args.includes('--provision') ? local[name]?.trim() : process.env[name]?.trim() || local[name]?.trim() || fnoxGet(name)
  if (!value) {
    console.error(`Missing ${name}. Run bun run live --provision to automate setup, or supply the Cloudflare relay's publish and subscribe-only tokens in .dev.vars, the environment, or fnox, then rerun bun run live.`)
    process.exit(1)
  }
  values[name] = value
}
if (values.MOQ_RELAY_TOKEN === values.MOQ_RELAY_TOKEN_SUBSCRIBE) {
  throw new Error('Use a separate subscribe-only Cloudflare token for watchers.')
}
// Replace the abandoned temporary-relay settings only after both Cloudflare
// credentials are available. A failed setup leaves the existing file intact.
const replace = new Set([...Object.keys(values), 'MOQ_RELAY_SIGNING_KEY'])
const lines = current.split('\n').filter((line) => !replace.has(line.split('=')[0]!.trim()))
chmodSync('.dev.vars', 0o600)
writeFileSync('.dev.vars', `${lines.join('\n').trimEnd()}\n${Object.entries(values).map(([name, value]) => `${name}=${JSON.stringify(value)}`).join('\n')}\n`, { mode: 0o600 })
console.log('Cloudflare live video configured. Run (or restart) bun run dev to load .dev.vars.')
