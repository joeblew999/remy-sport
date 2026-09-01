/**
 * Verify a deployed Worker, without a sign-in backdoor.
 *
 * This is what `mise run deploy` ends with. It used to end with `test:deployed`
 * — the whole Playwright suite pointed at production — which never actually ran:
 * it needs `TEST_OTP` as both a local env var and a Worker secret, and no task
 * provisions either, so the pipeline always exited red even when the deploy had
 * succeeded.
 *
 * Provisioning it to run the whole suite was the obvious fix and the wrong one:
 * the suite *writes* as it runs, and the `hook-*@remy.dev` accounts that used to
 * sit in the deployed database are what previous runs against production left
 * behind.
 *
 * `TEST_OTP` itself is now set deliberately, for a different reason — it fixes
 * the sign-in code for seeded accounts so the demo picker can offer them, since
 * `.test` addresses have no inbox. Two things keep that honest and both are
 * checked below: the seeded **admin** is excluded, because it can impersonate
 * and therefore reach a real person; and the outbox stays 404, because it would
 * expose everyone else's codes.
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

import { originOf, resolveTarget } from "../lib/cloudflare"

const BASE = process.env.CF_DEPLOY_URL ?? originOf(resolveTarget(process.argv.slice(2), "ambient"))

/**
 * Which deployment this is — asked, not guessed.
 *
 * Not every check means something on every surface. Three of them assert what
 * production must *refuse* — no dev outbox, no seed route, no admin in the demo
 * picker — and dev and staging open some of those deliberately. A run that is
 * permanently red is a run nobody reads, and the next genuine failure arrives
 * in a list somebody has already learned to skip.
 *
 * This classified by hostname: TUNNEL_HOSTNAME meant the tunnel, localhost
 * meant local, anything else meant production. That was already the second
 * version of the mistake. The first sniffed a `dev-` prefix and would have read
 * a real deployment at `dev-remy-staging` as dev, skipping every
 * deployment-safety check on it.
 *
 * Guessing does not survive a third environment. Staging is a public hostname
 * running a deployment whose checks *differ from production's* — the policy
 * table in src/environment.ts gives it the seed route and seeded sign-in
 * deliberately — so "not the tunnel, therefore production" would fail it for a
 * rule that is no longer true.
 *
 * So `/api/health` reports it and this reads it. A fourth environment becomes a
 * row in the policy table and a case below, not a new hostname rule.
 */
const SURFACES = ["production", "staging", "tunnel", "local"] as const
type Surface = (typeof SURFACES)[number]

const HOST = (() => {
  try {
    return new URL(BASE).hostname
  } catch {
    return BASE
  }
})()

/**
 * Ask the deployment. Anything else is production.
 *
 * The fail-safe rule survives the move from guessing to asking, and it matters
 * more here than it did: an unreachable host, a health endpoint that predates
 * the field, or an environment name this script has never heard of all resolve
 * to the *strictest* surface. A smoke run against something it cannot identify
 * asserts everything, which is a false failure at worst — where the other
 * direction would be silently skipping the checks that stop a seed route
 * shipping to production.
 *
 * `dev` becomes `tunnel` or `local` by hostname, and only there: those two run
 * identical code and differ only in how you reach them, so the distinction is
 * genuinely about the URL rather than about the deployment.
 */
async function classify(): Promise<Surface> {
  let declared: string | undefined
  try {
    const res = await fetch(`${BASE}/api/health`)
    if (res.ok) {
      declared = ((await res.json()) as { environment?: string }).environment
    }
  } catch {
    // Unreachable. Strictest, and the health check below will say so properly.
  }

  if (declared === "staging") return "staging"
  if (declared === "dev") {
    return HOST === "localhost" || HOST === "127.0.0.1" ? "local" : "tunnel"
  }
  return "production"
}

const SURFACE: Surface = await classify()

/** Runs everywhere. The default, and what most checks are. */
const ANYWHERE = SURFACES

/**
 * The checks that assert what a *production* deployment must refuse.
 *
 * Skipped rather than inverted elsewhere. Asserting "the outbox is open here"
 * would be testing that dev is configured for dev, which no deploy pipeline
 * needs to know.
 *
 * Staging is excluded on purpose and by policy, not by oversight: it has the
 * seed route and seeded sign-in because src/environment.ts says so, so
 * asserting their absence there would be asserting the opposite of the design.
 */
const PRODUCTION_ONLY = ["production"] as const
const WHY_DEV_DIFFERS =
  "dev captures mail and staging keeps the seed route — src/environment.ts mounts these on purpose"

/**
 * Where the VAPID keys for *this* host are supposed to come from.
 *
 * This used to say "`mise run push:secret:set` has not run" whatever was being
 * smoke-tested, and that task sets secrets on the **deployed** Worker. The dev
 * tunnel is not a deployment: its environment is `.dev.vars`, and no amount of
 * `push:secret:set` will change what it serves.
 *
 * A remedy that names the wrong file is worse than none — it sends somebody to
 * re-run a working deploy step and conclude the bug is elsewhere.
 */
const vapidRemedy = () =>
  SURFACE === "tunnel" || SURFACE === "local"
    ? `${HOST} runs from .dev.vars — run \`mise run dev:vars\` and restart wrangler dev`
    : `\`mise run push:secret:set\` has not run for ${SURFACE}`

const { SEED_ENTITIES } = await import("../../src/domain/model/entities")

let failed = 0
const skipped: string[] = []

/**
 * One check, and the surfaces it means anything on.
 *
 * `on` defaults to everywhere, so a check that applies universally is written
 * exactly as it was and a new one is universal unless somebody says otherwise —
 * which is the right default for a file about what must be true.
 */
/**
 * A check's answer: null passed, a string is the problem, `{ skip }` is
 * "this does not apply here and here is why".
 *
 * The in-function skip exists because not every condition is a surface.
 * Whether mail is captured or really sent is `MAIL_TRANSPORT`, which this
 * script cannot read — it is the Worker's environment, not ours — but *can*
 * observe, because the outbox route is mounted exactly when it is set. So that
 * check gates on a probe rather than on a tag, and still reports honestly
 * instead of returning a pass it did not earn.
 */
type Result = string | null | { skip: string }

async function check(
  name: string,
  fn: () => Promise<Result>,
  where: { on?: readonly Surface[]; why?: string } = {},
) {
  const on = where.on ?? ANYWHERE
  const note = (why: string) => {
    // Named and counted, never silent. A check that vanishes on some surfaces
    // is indistinguishable from one somebody deleted.
    console.log(`  – ${name}\n      skipped on ${SURFACE}: ${why}`)
    skipped.push(name)
  }

  if (!on.includes(SURFACE)) {
    note(where.why ?? `only applies to ${on.join(", ")}`)
    return
  }
  try {
    const problem = await fn()
    if (problem && typeof problem === "object") {
      note(problem.skip)
    } else if (problem) {
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

console.log(`smoke: ${BASE} (${SURFACE})`)

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

await check("every installable icon the manifest names is served", async () => {
  const res = await get("/manifest.webmanifest")
  if (!res.ok) return `expected 200, got ${res.status}`
  const { icons } = (await res.json()) as { icons?: { src: string }[] }
  if (!icons?.length) return "the manifest declares no icons"
  // The manifest names its icons unhashed, so they only resolve if vite copied
  // them verbatim from src/web/public. Authored one directory up they were
  // treated as source, content-hashed into /assets, and every one of these
  // 404'd — through a deploy, because a browser fetches a manifest icon only
  // when someone installs the app. Nothing else here would have noticed.
  const missing: string[] = []
  for (const { src } of icons) {
    const icon = await get(new URL(src, `${BASE}/manifest.webmanifest`).pathname)
    if (!icon.ok) missing.push(`${src} → ${icon.status}`)
  }
  return missing.length ? `not served: ${missing.join(", ")}` : null
})

await check("Web Push is configured and offering a usable key", async () => {
  const res = await get("/api/push/key")
  if (!res.ok) return `expected 200, got ${res.status}`
  const { publicKey } = (await res.json()) as { publicKey: string | null }
  if (!publicKey) return `no VAPID key — ${vapidRemedy()}`
  // 65 bytes base64url: an uncompressed P-256 point. A key of the wrong length
  // is accepted by `subscribe()` on some browsers and rejected on others, so
  // the shape is checked here rather than discovered on somebody's phone.
  const bytes = atob(publicKey.replace(/-/g, "+").replace(/_/g, "/"))
  return bytes.length === 65 && bytes.charCodeAt(0) === 4
    ? null
    : `key is ${bytes.length} bytes, expected a 65-byte uncompressed point`
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

await check("if seeded sign-in is on, it excludes the admin", async () => {
  // Enabled by TEST_OTP, which fixes the code for seeded non-admin accounts so
  // the demo picker can offer them — `.test` addresses have no inbox to read.
  // 404 means it is off, which is also fine.
  const res = await get("/api/dev/accounts")
  if (res.status === 404) return null
  if (!res.ok) return `expected 200 or 404, got ${res.status}`

  const body = (await res.json()) as { accounts?: { role: string }[]; code?: string }
  const admin = body.accounts?.find((a) => a.role === "admin")
  // The one account that can impersonate, and therefore reach a real person.
  if (admin) return "the seeded admin is being offered a published sign-in code"
  if (!body.code) return "seeded sign-in is on but no code was published — nobody can use it"
  return null
}, {
  on: PRODUCTION_ONLY,
  // Both halves are deployment rules. src/routes/dev-mail.ts offers the admin
  // exactly when `usesOutbox(env)` — locally the mail is captured and only the
  // operator can read it, and the admin console is a thing to develop against.
  // The published `code` is absent for the same reason: the outbox carries a
  // real generated one instead. So on dev this check failed twice over, and the
  // Worker was right both times.
  why: "dev offers the admin on purpose — mail is captured and only the operator reads it",
})

await check("the dev outbox does NOT exist", async () => {
  // The outbox is mounted only under MAIL_TRANSPORT=outbox, and unlike the
  // account list above it must NEVER open on a deployment: it would let anyone
  // read other people's sign-in codes, including a real person's. Seeded
  // sign-in deliberately does not need it — the code is published instead.
  const res = await get("/api/dev/outbox")
  return res.status === 404 ? null : `expected 404, got ${res.status}`
}, { on: PRODUCTION_ONLY, why: WHY_DEV_DIFFERS })

/**
 * Where mail is captured, prove the capture actually works.
 *
 * The three deployment-safety checks are skipped on dev, correctly — but that
 * left the two surfaces where the outbox *is* the mail path with nothing
 * verifying it. If the outbox route broke, smoke stayed green on the tunnel and
 * you found out when a sign-in code never arrived.
 *
 * ## Gated on a probe, not on the surface
 *
 * The condition is `MAIL_TRANSPORT=outbox`, which is the Worker's environment
 * and not readable from here. It is observable, though: the route is mounted
 * exactly when that is set. So this asks, and reports a skip when the answer is
 * "mail really goes out here" rather than passing by default.
 *
 * ## Why an address nobody owns
 *
 * `example.invalid` is reserved by RFC 2606 and can never resolve, so even if
 * this somehow ran against a host that really sends mail, there is no inbox to
 * reach. It is deliberately not a seeded account either: Better Auth writes one
 * verification row per request, so probing a real fixture user would invalidate
 * a pending code a developer was in the middle of using.
 *
 * The captured message costs nothing to leave — the outbox is an array on
 * `globalThis` (src/mail/mailer.ts), so it does not survive a restart and is
 * not in the database. The verification row is real, so that is cleaned up.
 */
await check("where mail is captured, the outbox actually captures it", async () => {
  const probe = await get("/api/dev/outbox")
  if (probe.status === 404) {
    return { skip: "mail is really sent here, so there is no outbox to verify" }
  }
  if (!probe.ok) return `the outbox is mounted but answered ${probe.status}`

  const to = "smoke-probe@example.invalid"
  const sent = await fetch(`${BASE}/api/auth/email-otp/send-verification-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email: to, type: "sign-in" }),
  })
  if (!sent.ok) return `could not request a code: ${sent.status}`

  try {
    const res = await get(`/api/dev/outbox?to=${encodeURIComponent(to)}`)
    if (!res.ok) return `reading the outbox answered ${res.status}`
    const { messages } = (await res.json()) as { messages: { subject: string; body: string }[] }
    if (!messages.length) return "a code was requested and nothing reached the outbox"
    // The code itself, not just that a row appeared: a message with no readable
    // code is the same dead end as no message, and the sign-in page reads it
    // out of the body the same way.
    return /\b\d{6}\b/.test(messages[0]!.body) || /\b\d{6}\b/.test(messages[0]!.subject)
      ? null
      : "a message arrived with no six-digit code in it"
  } finally {
    // Targeted, so a developer's own pending sign-in survives. Never
    // `DELETE /api/dev/outbox`, which clears everyone's.
    await fetch(`${BASE}/api/dev/otp?to=${encodeURIComponent(to)}`, { method: "DELETE" }).catch(
      () => undefined,
    )
  }
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

await check("the seed route does NOT exist", async () => {
  // It used to, and unauthenticated: 330 D1 statements to anyone who found it,
  // plus vocabulary upserts that re-asserted the PO's labels over edited ones.
  // Seeding is an operator action now — `mise run seed:remote` applies the SQL
  // through wrangler — so on a deployment this must be as absent as the outbox.
  const res = await fetch(`${BASE}/api/seed`, { method: "POST" })
  return res.status === 404 ? null : `expected 404, got ${res.status}`
}, { on: PRODUCTION_ONLY, why: WHY_DEV_DIFFERS })

// The skips are restated at the end as well as inline, because the inline note
// scrolls past and the last line is the one a pipeline log shows.
const tail = skipped.length ? ` (${skipped.length} skipped on ${SURFACE})` : ""

if (failed) {
  console.error(`\nsmoke: ${failed} check(s) failed against ${BASE}${tail}`)
  process.exit(1)
}

console.log(
  SURFACE === "production"
    ? `\nsmoke: the deployment is serving the PO's data and refusing what it should`
    : // Deliberately does not claim the second half. The checks that prove a
      // host refuses what it should are exactly the ones skipped here, so
      // saying it would be the same overclaim in the opposite direction.
      `\nsmoke: ${HOST} is serving the PO's data${tail}`,
)
