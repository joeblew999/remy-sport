/**
 * Verify a deployed Worker, without a sign-in backdoor.
 *
 * What `bun run deploy` ends with. Running the whole Playwright suite here was
 * the obvious alternative and the wrong one: the suite *writes* as it runs, and
 * the stray accounts that used to sit in the deployed database are what earlier
 * runs against production left behind.
 *
 * `bun run test:e2e` already runs that suite against a real Worker earlier in
 * the pipeline. What it cannot prove there is that *this deployment* boots,
 * reaches its own D1, and matches the schema just migrated onto it.
 *
 * So: read-only, plus one write that must be a no-op. Nothing here sends mail
 * or creates an account. `TEST_OTP` fixes the sign-in code for seeded accounts,
 * and two checks below keep that honest — the admin is excluded because it can
 * impersonate, and the outbox stays 404 because it would expose everyone's codes.
 */

import { namedEnvironment, originOf, resolveTarget } from "../lib/cloudflare.ts"
import { createApiClient } from "../../src/api-client.ts"
import { generate } from "../ops/openapi.ts"

/**
 * An explicit --env beats the ambient override.
 *
 * CF_DEPLOY_URL exists so you can point this at localhost or the dev tunnel. It
 * used to win unconditionally, so with it set — exported once in a shell, and
 * forgotten — `--env staging` silently smoked production instead and reported
 * success about the wrong deployment.
 */
const NAMED = namedEnvironment(process.argv.slice(2)) !== undefined
const BASE = NAMED
  ? originOf(resolveTarget(process.argv.slice(2), "ambient"))
  : (process.env.CF_DEPLOY_URL ?? originOf(resolveTarget([], "ambient")))

/**
 * Which deployment this is — asked, not guessed.
 *
 * Three checks assert what production must *refuse*, and dev and staging open
 * some of those deliberately. A permanently red run is one nobody reads.
 *
 * This classified by hostname twice, and both were wrong: a `dev-` prefix would
 * have read a real deployment at `dev-remy-staging` as dev and skipped every
 * safety check, and "not the tunnel, therefore production" fails staging, whose
 * checks differ from production's by policy.
 *
 * So `/api/health` reports it and this reads it. A fourth environment becomes a
 * row in the policy table, not a new hostname rule.
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
/**
 * Did the API say this does not exist?
 *
 * `ORPCError` carries a code, and `NOT_FOUND` is what both a gated-off
 * procedure and an absent one raise. Checked structurally rather than with
 * `instanceof`: the error crosses a client boundary, and a message match would
 * break on a wording change.
 */
function isNotFound(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "NOT_FOUND"
}

async function classify(): Promise<Surface> {
  let declared: string | undefined
  try {
    declared = (await createApiClient(BASE).health.get()).environment
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
 * Wrong twice, both times silently. First it named the deployed-Worker remedy
 * whatever was being smoked — but the tunnel reads `.dev.vars`, so setting
 * Worker secrets changes nothing it serves. Then both halves went on naming
 * commands that had since been deleted.
 *
 * A remedy is part of the CLI surface, not prose beside it.
 * tests/repo/remedies.test.ts checks every command named in the tree.
 */
const vapidRemedy = () =>
  SURFACE === "tunnel" || SURFACE === "local"
    ? `${HOST} runs from .dev.vars — run \`bun run setup\` and restart wrangler dev`
    : `\`bun run ops provision --env ${SURFACE} --apply\` has not set them for ${SURFACE}`

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

/**
 * The worker this deployment publishes can actually install.
 *
 * A service worker fetches every precache entry before it installs, and only an
 * installed worker activates. If the install never finishes, the worker already
 * on a reader's machine goes on answering navigations from its own cache — so a
 * returning reader keeps the build they had, for as long as that takes.
 *
 * That happened: `emptyOutDir` is false by default when the output sits outside
 * the Vite root, so every build's assets accumulated into the precache manifest
 * until it was too large to install, and production served a week-old interface
 * to anyone who had visited before.
 *
 * **Every check passed throughout** — which is why this one asks the origin
 * rather than the built artefact. Every other tier is a first-time visitor
 * holding no worker and no cache, so none could see the only thing wrong. This
 * asks the question a returning reader's browser asks.
 */
await check("the service worker it publishes can finish installing", async () => {
  const res = await get("/sw.js")
  if (!res.ok) return `expected 200 for /sw.js, got ${res.status}`
  const sw = await res.text()

  // workbox records urls and revisions, not sizes, and Cloudflare serves these
  // chunked, so `content-length` is null on both GET and HEAD. The only honest
  // measure is the bytes themselves — which is what the browser downloads too.
  const named = [...new Set([...sw.matchAll(/"((?:assets|fonts)\/[^"]+)"/g)].map((m) => m[1]!))]
  if (!named.length) return "the service worker names no precache entries — the manifest did not inject"

  const BUDGET_MB = 10
  const budget = BUDGET_MB * 1024 * 1024
  let bytes = 0
  let weighed = 0
  for (const path of named) {
    const asset = await fetch(`${BASE}/${path}`)
    if (!asset.ok) return `the precache names ${path}, which the origin answers with ${asset.status}`
    bytes += (await asset.arrayBuffer()).byteLength
    weighed++
    // Stop at the budget rather than proving the point in full: a deployment
    // this broken should not have ninety megabytes pulled through to say so.
    if (bytes > budget) break
  }

  return bytes <= budget
    ? null
    : `the precache passed ${BUDGET_MB}MB after ${weighed} of ${named.length} file(s). ` +
        `A worker downloads all of it before it installs, and one that never installs never ` +
        `replaces the worker already serving this reader. Check build.emptyOutDir in src/web/vite.config.ts.`
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
  // Both halves are deployment rules. src/api/dev-accounts.ts offers the admin
  // exactly when `usesOutbox(env)` — locally the mail is captured and only the
  // operator can read it, and the admin console is a thing to develop against.
  // The published `code` is absent for the same reason: the outbox carries a
  // real generated one instead. So on dev this check failed twice over, and the
  // Worker was right both times.
  why: "dev offers the admin on purpose — mail is captured and only the operator reads it",
})

/**
 * Every public GET the document promises actually answers.
 *
 * Derived from the generated spec, not a list kept here: `generate("public")`
 * is the same call that produces the published document, so an endpoint added
 * to the router is smoked the day it exists and one removed stops being
 * probed without anybody editing this file. A hand-kept list would drift, and
 * a drifting smoke list is worse than none — it reads as coverage.
 *
 * Only GETs that need no argument. An operation with a required parameter —
 * a path id or a query filter — needs a value that exists on *this*
 * deployment, which is a fixture question rather than a reachability one, and
 * the read paths above already cover that shape.
 *
 * The required-parameter half was missed first time round and this check found
 * it: `/standings` takes a required `eventId` and answered 400, which read as
 * a broken endpoint and was a probe calling it wrongly.
 */
await check("every public GET the document promises answers", async () => {
  const document = await generate("public")
  const paths = Object.entries(document.paths ?? {})
    .filter(([path]) => !path.includes("{"))
    .filter(([, methods]) => {
      const get = ((methods ?? {}) as { get?: { parameters?: { required?: boolean }[] } }).get
      return get !== undefined && !(get.parameters ?? []).some((parameter) => parameter.required)
    })
    .map(([path]) => path)

  const refused: string[] = []
  for (const path of paths) {
    const res = await fetch(`${BASE}/api${path}`)
    // 401 is an answer: the document says which operations demand a session,
    // and a public probe getting one is the contract working, not a failure.
    if (!res.ok && res.status !== 401) refused.push(`${path} answered ${res.status}`)
  }
  return refused.length ? refused.join("; ") : null
})

/**
 * Whether this deployment claims deep links, said out loud either way.
 *
 * Not a failure when absent: universal links are off until an app exists to
 * claim them, and none of the identifiers is set in any environment today. But
 * "not configured" has to be a line rather than a silence — a check that
 * vanishes when a feature is off is indistinguishable from one somebody
 * deleted, which is the argument the skip helper above already makes.
 *
 * When it IS configured the assertions are Apple's: exactly that path, JSON,
 * and no redirect, because their crawler follows none.
 */
await check("app links", async () => {
  const res = await fetch(`${BASE}/.well-known/apple-app-site-association`, { redirect: "manual" })
  if (res.status === 404) return { skip: "not configured — no association file is published" }
  if (res.status !== 200) return `the association path answered ${res.status}`
  const type = res.headers.get("content-type") ?? ""
  // Measured once and worth keeping: the path carries no extension, so the
  // asset store infers nothing and serves it with no Content-Type unless the
  // `_headers` file emitted beside it says otherwise. Apple requires JSON.
  if (!type.includes("application/json")) return `served as "${type}", and Apple requires application/json`
  const body = (await res.json()) as { applinks?: { details?: { appIDs?: string[] }[] } }
  const ids = body.applinks?.details?.[0]?.appIDs ?? []
  if (!ids.length) return "published, but names no appIDs — iOS will cache that"
  return null
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
 * The deployment-safety checks are skipped on dev, correctly — which left the
 * two surfaces where the outbox *is* the mail path with nothing verifying it.
 *
 * Gated on a probe rather than the surface: `MAIL_TRANSPORT` is the Worker's
 * environment and not readable here, but the route is mounted exactly when it
 * is set. So this asks, and skips rather than passing by default.
 *
 * `example.invalid` is reserved by RFC 2606 and can never resolve. Deliberately
 * not a seeded account: Better Auth writes one verification row per request, so
 * probing a fixture user would invalidate a code somebody was using. The
 * captured message lives on `globalThis` and costs nothing to leave; the
 * verification row is real and is cleaned up.
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
    await createApiClient(BASE).dev.otp.clear({ query: { to } }).catch(() => undefined)
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
  // Seeding is an operator action now — `bun run db seed-remote` applies the SQL
  // through wrangler — so on a deployment this must be as absent as the outbox.
  /**
   * Absence, read as an error code rather than a status.
   *
   * The typed client raises a procedure that does not exist here as an
   * ORPCError with code NOT_FOUND — the `dev` builder throws exactly that when
   * POLICY withholds the capability, and a route that was never built answers
   * the same way. Indistinguishable on purpose: nothing should be able to tell
   * "gated off" from "does not exist" from outside.
   *
   * So a *rejection* is the pass here, and a resolution is the failure.
   */
  try {
    await createApiClient(BASE).dev.seed()
    return "the seed route answered — it must not exist on a deployment"
  } catch (e) {
    return isNotFound(e) ? null : `expected NOT_FOUND, got ${(e as Error).message}`
  }
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
