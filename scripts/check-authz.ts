/**
 * Every procedure declares how it is authorised, or the build fails.
 *
 * This exists because model-driven authorisation was opt-in, and opt-in
 * authorisation is not authorisation. `requireAction` was something a person
 * remembered; on 2026-08-28 all forty-seven procedures declared nothing that
 * could be inspected, and an entire feature — Web Push, including who receives
 * a notification — shipped with no authorisation at all. Nothing caught it,
 * because "deliberately public" and "somebody forgot" were the same thing to
 * every check in the repo.
 *
 * The router is walked for real, not parsed: these are the procedures the
 * Worker serves, so a procedure cannot be reachable and invisible here.
 *
 * What it enforces:
 *
 *   1. Every procedure carries exactly one policy.
 *   2. Every action named is an action the model actually defines.
 *   3. Anything served publicly is granted to PUBLIC *in the model* — so the
 *      day the PO closes something, this fails rather than keeping it open.
 *   4. The escape hatches stay countable, and are printed every run.
 */

import { GRANTS } from "../src/domain/vocabularies"
import { policyOf, type Policy } from "../src/api/base"
import { router } from "../src/api/index"

type Node = Record<string, unknown>

const found: { path: string; policy: Policy | null }[] = []

function walk(node: Node, path: string[]) {
  for (const [key, value] of Object.entries(node)) {
    const internals = (value as Record<string, Node> | null)?.["~orpc"]
    if (internals?.handler) {
      const middlewares = (internals.middlewares ?? []) as unknown[]
      const policies = middlewares.map(policyOf).filter((p): p is Policy => p !== null)
      found.push({ path: [...path, key].join("."), policy: policies[0] ?? null })
    } else if (value && typeof value === "object") {
      walk(value as Node, [...path, key])
    }
  }
}

walk(router as unknown as Node, [])

const problems: string[] = []
const escapes: string[] = []
const actions = new Set(Object.keys(GRANTS))

for (const { path, policy } of found) {
  if (!policy) {
    problems.push(
      `${path}: declares no policy. Add requireAction(...), openTo(...), ` +
        "checkedInHandler(...) or infrastructure(...) — see src/api/base.ts.",
    )
    continue
  }

  const named =
    policy.kind === "handler"
      ? policy.actions
      : policy.kind === "infrastructure"
        ? []
        : [policy.action]

  for (const action of named) {
    if (!actions.has(action)) {
      problems.push(`${path}: names "${action}", which the model does not define.`)
    }
  }

  if (policy.kind === "open") {
    // Re-checked here as well as at load: openTo throws on a bad action, but
    // only when that module is imported, and a rarely-loaded route would find
    // out in production.
    const grants = (GRANTS as Record<string, ReadonlyArray<{ relation: string }>>)[policy.action]
    if (!grants?.some((g) => g.relation === "PUBLIC")) {
      problems.push(
        `${path}: served publicly as "${policy.action}", but the model no longer grants ` +
          "that to PUBLIC. Either the model changed or this should be authed.",
      )
    }
    escapes.push(`  open            ${path}  (${policy.action})`)
  }
  if (policy.kind === "infrastructure") escapes.push(`  infrastructure  ${path}  — ${policy.why}`)
  if (policy.kind === "stricter") {
    escapes.push(`  stricter        ${path}  (${policy.action}) — ${policy.why}`)
  }
  if (policy.kind === "handler") {
    escapes.push(`  handler-checked ${path}  (${policy.actions.join(", ")})`)
  }
}

const enforced = found.filter((f) => f.policy?.kind === "action").length

if (problems.length) {
  console.error(`check-authz: ${problems.length} of ${found.length} procedures are a problem\n`)
  for (const p of problems) console.error(`  ${p}`)
  console.error(
    "\nAuthorisation is the model's answer and every procedure must say which. " +
      "A procedure that declares nothing is not public — it is unreviewed.",
  )
  process.exit(1)
}

/**
 * The routes that are not oRPC procedures at all.
 *
 * The walk above covers the router, and I claimed that was the whole API
 * surface. It was not: five Hono sub-routers are mounted alongside it, and one
 * of them — `POST /api/seed` — was an unauthenticated write on a public domain.
 * A check that enumerates only the easy half is worse than none, because it
 * reads as a clean bill of health.
 *
 * These cannot carry a policy: they are not procedures, and several exist
 * precisely to sit outside the model (Better Auth's own routes, `.well-known`).
 * So they are listed here by hand and the list is asserted — a new one appears
 * as a failure rather than as silence.
 */
const HONO_ROUTES: Record<string, string> = {
  "POST /api/seed": "dev only — 404s unless MAIL_TRANSPORT=outbox; deploys seed via wrangler",
  "POST /api/analytics": "a beacon, deliberately unauthenticated — see src/routes/analytics.ts; writes only to Analytics Engine, reads nothing, answers 204",
  "GET /api/dev/events": "dev only — 404s on a deployment, on the same MAIL_TRANSPORT gate as the outbox; serves the in-memory telemetry ring, which a deployment never fills",
  "GET /api/dev/outbox": "dev only — 404s on a deployment; would expose sign-in codes",
  "DELETE /api/dev/outbox": "dev only — same gate",
  "DELETE /api/dev/otp": "dev only — same gate as the outbox; clears a pending sign-in code so a test can request a fresh one",
  "GET /api/dev/accounts": "the demo picker; gated on TEST_OTP and never offers the admin",
  "POST /api/dev/prune-sessions": "dev only — 404s on a deployment; bulk session delete",
  "ALL /api/auth/*": "Better Auth owns its own authorisation, including the admin plugin; the wrapper records the outcome of POSTs and reads no request body",
  "GET /.well-known/apple-app-site-association": "public by specification; 404s until configured",
  "GET /.well-known/assetlinks.json": "public by specification; 404s until configured",
  "GET /api/versions": "build metadata — the commit and time this Worker was built from",
  "GET /openapi.json": "the published contract, which documents its own security schemes",
  "GET /doc": "Swagger UI over the above",
  "GET /": "the SPA shell",
  "ALL /*": "SPA fallback — static assets and hash routes, no database access",
  // The two the procedure walk above already covers in full: every oRPC
  // procedure is served through these, and each one declares its own policy.
  "ALL /api/*": "the oRPC handler — every procedure under it is policied above",
  "ALL /rpc/*": "the same handler, on the SPA's transport",
}

// The named export, not the default. The default is `{ fetch, scheduled }`
// now that the Worker has a cron trigger, and reading `.routes` off that gave
// undefined — this check has to fail loudly or not at all.
const { app } = await import("../src/index")
const live = new Set(
  (app as unknown as { routes: { method: string; path: string }[] }).routes.map(
    (r) => `${r.method} ${r.path}`,
  ),
)
const undeclared = [...live].filter((r) => !(r in HONO_ROUTES))
const stale = Object.keys(HONO_ROUTES).filter((r) => !live.has(r))

if (undeclared.length) {
  console.error("check-authz: routes mounted outside the oRPC router with no note:\n")
  for (const r of undeclared) console.error(`  ${r}`)
  console.error(
    "\nAdd it to HONO_ROUTES in this file with a sentence on how it is guarded. " +
      "`POST /api/seed` sat here unauthenticated for months because nothing listed it.",
  )
  process.exit(1)
}

console.log(
  `check-authz: ${found.length} procedures, ${enforced} enforced by the model, ` +
    `${escapes.length} declared otherwise; ${live.size} non-procedure routes accounted for`,
)
if (stale.length) console.log(`  (no longer mounted: ${stale.join(", ")})`)
// Printed rather than hidden: these are the ones a person should re-read.
for (const line of escapes.sort()) console.log(line)
