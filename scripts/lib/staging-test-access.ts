import { request } from '@playwright/test'
import { setTimeout as sleep } from 'node:timers/promises'
import { DEMO_SIGN_IN_CODE } from '../../src/environment.ts'
import { SEED_ENTITIES } from '../../src/domain/model/entities.ts'
import { Refused, originOf, wrangler, type Target } from './cloudflare.ts'

/** Probe the actual admin capability and verify that the probe session is ended. */
export async function adminAccess(origin: string): Promise<boolean> {
  const admin = SEED_ENTITIES.users.find(user => user.roleCode === 'ADMIN')
  if (!admin) throw new Refused('The seed has no admin account')
  const ctx = await request.newContext({ baseURL: origin, extraHTTPHeaders: { Origin: origin }, timeout: 20000 })
  try {
    const sent = await ctx.post('/api/auth/email-otp/send-verification-otp', { data: { email: admin.email, type: 'sign-in' } })
    if (!sent.ok()) throw new Refused(`Admin code request failed: HTTP ${sent.status()}`)
    const signed = await ctx.post('/api/auth/sign-in/email-otp', { data: { email: admin.email, otp: DEMO_SIGN_IN_CODE } })
    if (!signed.ok()) {
      const body = await signed.json()
      if (body.code === 'INVALID_OTP') return false
      throw new Refused(`Admin sign-in failed: HTTP ${signed.status()} (${body.code ?? 'unknown'})`)
    }
    const state = await ctx.storageState()
    const signedOut = await ctx.post('/api/auth/sign-out', { data: {} })
    if (!signedOut.ok()) throw new Refused(`Admin probe cleanup failed: HTTP ${signedOut.status()}`)
    // Re-use the ORIGINAL cookie: checking the cleared cookie jar proves nothing.
    const verify = await request.newContext({ baseURL: origin, storageState: state, timeout: 20000 })
    try {
      const session = await verify.get('/api/auth/get-session')
      if (!session.ok() || await session.json() !== null) throw new Refused('Admin probe session survived sign-out')
    } finally { await verify.dispose() }
    return true
  } finally { await ctx.dispose() }
}

async function waitForAccess(origin: string, wanted: boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (await adminAccess(origin) === wanted) return
    await sleep(2500)
  }
  throw new Refused(`Could not confirm staging admin access is ${wanted ? 'enabled' : 'disabled'}`)
}

/** Change only the temporary staging override; preserve an existing override. */
export async function withStagingAccess(target: Target, run: () => Promise<void>): Promise<void> {
  if (target.environment !== 'staging') throw new Refused('Automatic test access is staging-only')
  const listed = wrangler(['secret', 'list', '--format', 'json'], target)
  if (listed.code !== 0) throw new Refused('Could not read staging secret names; nothing changed')
  const secrets = JSON.parse(listed.out) as Array<{ name: string }>
  if (!Array.isArray(secrets)) throw new Refused('Invalid staging secret list')
  const alreadySet = secrets.some(secret => secret.name === 'TEST_ADMIN_OTP')
  const origin = originOf(target)
  let failure: unknown
  let interrupted = false
  const cancel = () => { interrupted = true }
  process.on("SIGINT", cancel)
  process.on("SIGTERM", cancel)
  try {
    if (!alreadySet) {
      console.log('e2e: enabling temporary staging admin access')
      const put = wrangler(['secret', 'put', 'TEST_ADMIN_OTP'], target, { stdin: DEMO_SIGN_IN_CODE })
      if (put.code !== 0) throw new Refused('Could not enable staging admin access')
    }
    await waitForAccess(origin, true)
    if (interrupted) throw new Refused('Staging test preparation interrupted')
    console.log('e2e: admin sign-in verified; all admin tests are required')
    await run()
  } catch (err) { failure = err }
  finally {
    try {
      if (!alreadySet) {
        const removed = wrangler(['secret', 'delete', 'TEST_ADMIN_OTP'], target)
        if (removed.code !== 0 && !/not found|does not exist/i.test(removed.out + removed.err)) {
          throw new Refused('Could not remove temporary staging admin access')
        }
      }
      await waitForAccess(origin, alreadySet)
      console.log(`e2e: staging admin access restored and verified (${alreadySet ? 'enabled before this run' : 'disabled'})`)
    } catch (cleanup) {
      throw new AggregateError(failure ? [failure, cleanup] : [cleanup], 'Staging cleanup failed')
    } finally {
      process.off('SIGINT', cancel)
      process.off('SIGTERM', cancel)
    }
  }
  if (failure) throw failure
}
