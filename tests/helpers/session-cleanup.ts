import { request, type APIRequestContext } from '@playwright/test'
import { mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

const directory = `${process.env.E2E_STATE_DIR ?? '.playwright/auth'}/sessions`

/** Persist only sessions created by this run, before their contexts can close. */
export async function saveSession(ctx: APIRequestContext): Promise<string> {
  mkdirSync(directory, { recursive: true })
  const path = `${directory}/${randomUUID()}.json`
  writeFileSync(path, JSON.stringify(await ctx.storageState()), { mode: 0o600 })
  return path
}

export async function endSession(path: string, baseURL: string): Promise<void> {
  if (!existsSync(path)) return
  const state = JSON.parse(readFileSync(path, 'utf8'))
  const ctx = await request.newContext({ baseURL, storageState: state, extraHTTPHeaders: { Origin: baseURL }, timeout: 20000 })
  try {
    const existing = await ctx.get('/api/auth/get-session')
    if (!existing.ok()) throw new Error(`Session cleanup read failed: HTTP ${existing.status()}`)
    if (await existing.json() !== null) {
      const out = await ctx.post('/api/auth/sign-out', { data: {} })
      if (!out.ok()) throw new Error(`Session cleanup failed: HTTP ${out.status()}`)
      const verify = await request.newContext({ baseURL, storageState: state, timeout: 20000 })
      try {
        const current = await verify.get('/api/auth/get-session')
        if (!current.ok() || await current.json() !== null) throw new Error('Session survived sign-out')
      } finally { await verify.dispose() }
    }
    unlinkSync(path)
  } finally { await ctx.dispose() }
}

export async function endRunSessions(baseURL: string, records = directory): Promise<void> {
  if (!existsSync(records)) return
  const errors: unknown[] = []
  for (const name of readdirSync(records)) {
    try { await endSession(`${records}/${name}`, baseURL) } catch (error) { errors.push(error) }
  }
  if (errors.length) throw new AggregateError(errors, 'Test session cleanup failed; session records retained for recovery')
}
