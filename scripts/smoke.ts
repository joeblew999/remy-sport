/**
 * Verify a deployed Worker, without a sign-in backdoor.
 *
 * This is what `mise run deploy` ends with. It used to end with `test:deployed`
 * — the whole Playwright suite pointed at production — which never actually ran:
 * it needs `TEST_OTP` as both a local env var and a Worker secret, and no task
 * provisions either, so the pipeline always exited red even when the deploy had
 * succeeded.
 *
 * Provisioning it was the obvious fix and the wrong one. `TEST_OTP` makes
 * `generateOTP` return a constant for every seeded address, so setting it on a
 * public site is a permanent sign-in backdoor for the admin account. And the
 * suite writes as it runs: the seven `hook-*@remy.dev` accounts in the deployed
 * database are what previous runs against production left behind.
 *
 * The suite already runs against a real Worker earlier in the same pipeline
 * (`mise run test`, wrangler dev + local D1). Running it twice mostly re-proves
 * the same things. What it cannot prove there — and all this needs to — is that
 * *this deployment* boots, reaches its own D1, and matches the schema that was
 * just migrated onto it.
 *
 * So: read-only, plus one write that must be a no-op. Nothing here sends mail
 * or creates an account.
 */

const BASE = process.env.CF_DEPLOY_URL ?? "https://remy.ubuntusoftware.net"

const { SEED_ENTITIES } = await import("../src/db/seed-data")

let failed = 0

async function check(name: string, fn: () => Promise<string | null>) {
  try {
    const problem = await fn()
    if (problem) {
      console.log(`  ✘ ${name}\n      ${problem}`)
      failed++
    } else {
      console.log(`  ✓ ${name}`)
    }
  } catch (err) {
    console.log(`  ✘ ${name}\n      ${(err as Error).message}`)
    failed++
  }
}

const get = (path: string) => fetch(`${BASE}${path}`)

console.log(`smoke: ${BASE}`)

await check("health responds", async () => {
  const res = await get("/api/health")
  if (!res.ok) return `expected 200, got ${res.status}`
  const body = (await res.json()) as { status?: string }
  return body.status === "ok" ? null : `expected status "ok", got ${JSON.stringify(body)}`
})

await check("the SPA is served", async () => {
  const res = await get("/")
  if (!res.ok) return `expected 200, got ${res.status}`
  const html = await res.text()
  // run_worker_first means a misconfigured [assets] block returns the Worker's
  // 404 rather than the app, and both are 200-shaped to a naive check.
  return html.includes("<div id=\"root\"") || html.toLowerCase().includes("remy")
    ? null
    : "response did not look like the app shell"
})

await check("the events read path returns the PO's data", async () => {
  const res = await get("/api/events")
  if (!res.ok) return `expected 200, got ${res.status}`
  const { events } = (await res.json()) as { events: unknown[] }
  // Proves the Worker reaches its D1 and the seeded rows are actually there —
  // not just that the route exists.
  return events.length >= SEED_ENTITIES.events.length
    ? null
    : `expected at least ${SEED_ENTITIES.events.length} events, got ${events.length}`
})

await check("the teams read path answers", async () => {
  const res = await get("/api/teams")
  return res.ok ? null : `expected 200, got ${res.status}`
})

await check("the dev outbox does NOT exist", async () => {
  // /api/dev/* is mounted only under MAIL_TRANSPORT=outbox. If this ever answers
  // in production, deployed mail is being captured instead of sent — and anyone
  // can read other people's sign-in codes.
  const res = await get("/api/dev/outbox")
  return res.status === 404 ? null : `expected 404, got ${res.status}`
})

await check("Better Auth is mounted and reaches the database", async () => {
  // A signed-out visitor gets 200 with a null body. A 500 here is the signature
  // of a Worker deployed ahead of its migrations — the shape migration 0007
  // caused, where every sign-in failed on a column that did not exist yet.
  const res = await get("/api/auth/get-session")
  if (res.status !== 200) return `expected 200, got ${res.status}`
  const body = await res.text()
  return body.includes("user") || body === "null" || body === "" || body === "{}"
    ? null
    : `unexpected session body: ${body.slice(0, 120)}`
})

await check("a wrong sign-in code is refused", async () => {
  // Exercises the verify path against the real database without sending mail or
  // needing a fixed code. A 500 means the auth tables are wrong; a 200 would
  // mean something far worse.
  const res = await fetch(`${BASE}/api/auth/sign-in/email-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email: "nobody@example.invalid", otp: "000000" }),
  })
  if (res.status < 400 || res.status >= 500) return `expected a 4xx refusal, got ${res.status}`
  // The status alone proves nothing: a host that has never heard of this route
  // also answers 4xx, so the check passed against example.com. Require Better
  // Auth's own error shape, which only something running Better Auth produces.
  const body = (await res.json().catch(() => null)) as { code?: string; message?: string } | null
  return body?.code || body?.message
    ? null
    : "4xx, but not a Better Auth error body — is that route actually mounted?"
})

await check("re-seeding writes nothing", async () => {
  // The one write, and it must be a no-op. Every statement in seed.sql is
  // INSERT OR IGNORE, so a non-zero count means either the deployed schema is
  // missing the constraints that make it idempotent, or the migrations did not
  // land — which is exactly what silently duplicated rows on past deploys.
  const res = await fetch(`${BASE}/api/seed`, { method: "POST" })
  if (!res.ok) return `expected 200, got ${res.status}`
  const body = (await res.json()) as { statements: number; written: number }
  if (!body.statements) return "the seed reported no statements"
  return body.written === 0 ? null : `re-seeding wrote ${body.written} rows; expected 0`
})

if (failed) {
  console.error(`\nsmoke: ${failed} check(s) failed against ${BASE}`)
  process.exit(1)
}
console.log(`\nsmoke: the deployment is serving the PO's data and refusing what it should`)
