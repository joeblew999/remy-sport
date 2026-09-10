/**
 * No two environments may share anything that carries data or traffic.
 *
 * ## Why this reads resolved config and not wrangler.toml
 *
 * Named environments inherit some top-level keys and not others, and the split
 * is the reason this file exists. The keys wrangler does NOT inherit are safe:
 * it prints a warning naming each one and the binding is absent, so a missing
 * `d1_databases` under `[env.staging]` is loud and cannot reach production.
 *
 * The inherited keys are the dangerous ones, because inheriting is legal.
 * `routes` is inherited: an `[env.staging]` with no route override resolves to
 * `remy.ubuntusoftware.net` — production's hostname — and
 * `wrangler deploy --env staging` then publishes a staging build, pointed at a
 * staging database, onto the domain real people use.
 *
 * **Wrangler warns about that today, and only by luck.** Measured, both cases:
 * when the inherited route is `custom_domain = true` the dry run says
 * "Deploying this environment will reassign these custom domains away from the
 * top-level Worker", which is unmissable. When it is an ordinary route pattern
 * with a `zone_name`, the same inheritance produces **no warning at all** — the
 * dry run is clean and the deploy takes the hostname.
 *
 * So the existing protection is conditional on a config detail that has nothing
 * to do with environments. Changing production from a custom domain to a zone
 * route — a reasonable thing to do for a path split — silently removes it. That
 * is the gap this file closes: it does not care which kind of route it is.
 *
 * Reading the TOML directly would not catch that, because the hazard is
 * precisely what is *absent* from the file. So this asks wrangler to resolve
 * each environment the way a deploy would, and compares the answers.
 *
 * Cloudflare's own inheritable-keys documentation is wrong in the direction
 * that matters here — it omits `send_email`, `d1_databases` and
 * `analytics_engine_datasets` from the non-inheritable column while wrangler
 * warns about all three. Resolved config is the only trustworthy source.
 */

import { declaredEnvs, resolvedConfig } from "../../scripts/lib/cloudflare"
import { rule } from "./helpers"
import { lineOf, parse, sources, walk } from "./lib/ast"

/** Which environment a resolved config belongs to, for messages. */
type Named = { label: string; env: string | undefined }

/**
 * The declared environments, plus the top-level one.
 *
 * Enumerated from the file rather than hardcoded so a future `[env.preview]`
 * is covered the day somebody adds it — a new environment that nothing compares
 * against is exactly how the first one would have gone wrong.
 */
const declared = declaredEnvs()
const targets: Named[] = [
  { label: "(top-level)", env: undefined },
  ...declared.map((env) => ({ label: env, env })),
]

const resolved = targets.map((t) => ({ ...t, config: resolvedConfig(t.env) }))

/**
 * The hostname a route serves.
 *
 * A route is either a custom domain (`remy.ubuntusoftware.net`) or a pattern
 * with a path and possibly a wildcard (`remy.ubuntusoftware.net/*`,
 * `*.remy.ubuntusoftware.net/api/*`). Comparing the raw strings would treat
 * those as different hosts, which is wrong in both directions — it would miss a
 * genuine collision between a domain and a pattern over the same host, and it
 * false-positives against BETTER_AUTH_URL, which is only ever a host.
 */
const hostOf = (route: string | { pattern: string }): string => {
  const pattern = typeof route === "string" ? route : route.pattern
  return pattern.split("/")[0]!.replace(/^\*\./, "")
}

const hostsOf = (c: (typeof resolved)[number]["config"]) => (c.routes ?? []).map(hostOf)

const problems: string[] = []

/**
 * Every resource an environment must not share with another.
 *
 * One list rather than a check per resource type, because the failure is the
 * same failure each time: two deployments writing to one place, discovered when
 * the data is already mixed. A queue is the worst of them — a shared queue
 * means staging's fixtures fan out through production's consumer to production's
 * real subscribers — but none of these is survivable.
 */
const exclusive = (c: (typeof resolved)[number]["config"]) => ({
  "worker name": [c.name].filter(Boolean) as string[],
  // By host, not by pattern — see hostOf. Two environments serving
  // `example.net` and `example.net/*` are still fighting over one hostname.
  "route host": hostsOf(c),
  "D1 database": c.d1_databases.map((d: { database_name?: string }) => d.database_name).filter(Boolean) as string[],
  "R2 bucket": c.r2_buckets.map((b: { bucket_name?: string }) => b.bucket_name).filter(Boolean) as string[],
  "analytics dataset": c.analytics_engine_datasets
    .map((a: { dataset?: string }) => a.dataset)
    .filter(Boolean) as string[],
  queue: [
    ...(c.queues.producers ?? []).map((q: { queue: string }) => q.queue),
    ...(c.queues.consumers ?? []).map((q: { queue: string }) => q.queue),
  ],
})

// ── 1. Nothing is shared ─────────────────────────────────────────────────────
const seen = new Map<string, string>()
for (const { label, config } of resolved) {
  for (const [kind, names] of Object.entries(exclusive(config))) {
    for (const name of names) {
      const key = `${kind}:${name}`
      const owner = seen.get(key)
      if (owner && owner !== label) {
        problems.push(
          `${kind} "${name}" is claimed by both ${owner} and ${label}.\n` +
            `      If ${label} declares no override for it, it INHERITED the top-level\n` +
            `      value. Wrangler warns about some of those and not others, so the\n` +
            `      absence of a warning above is not evidence that this is fine.`,
        )
      } else {
        seen.set(key, label)
      }
    }
  }
}

// ── 2. Each environment says what it is ──────────────────────────────────────
//
// `ENVIRONMENT` selects a column of the policy table in src/environment.ts, and
// a copy-pasted `[env.staging]` block that still says "production" is the whole
// failure in one word. Both directions are bad and one is much worse: staging
// labelled production merely loses its seed route, while production labelled
// staging OPENS the seed route and the demo account picker on the real site.
for (const { label, env, config } of resolved) {
  const declaredEnv = (config.vars as Record<string, unknown>).ENVIRONMENT
  const expected = env ?? "production"
  if (declaredEnv !== expected) {
    problems.push(
      `${label} sets ENVIRONMENT = ${JSON.stringify(declaredEnv)}, expected ${JSON.stringify(expected)}.\n` +
        `      That variable picks a row of the capability table in src/environment.ts,\n` +
        `      so this deployment would run under another environment's permissions.`,
    )
  }
}

// ── 3. Auth points at the host it is served from ─────────────────────────────
//
// BETTER_AUTH_URL is the origin in sign-in links and OAuth callbacks. If
// staging inherits production's, a staging sign-in mails somebody a link into
// production — and the session it mints is a production session.
for (const { label, config } of resolved) {
  const authUrl = (config.vars as Record<string, unknown>).BETTER_AUTH_URL
  if (typeof authUrl !== "string") continue
  const hosts = hostsOf(config)
  if (!hosts.length) continue
  const host = new URL(authUrl).host
  if (!hosts.includes(host)) {
    problems.push(
      `${label} serves ${hosts.join(", ")} but BETTER_AUTH_URL points at ${host}.\n` +
        `      Sign-in links from this deployment would land on a different one.`,
    )
  }
}

// ── 4. No code names one environment's resource ──────────────────────────────
//
// Rule 1 keeps the environments' resources distinct. This keeps the *tools*
// honest about that, which is a separate failure, and the one that actually
// happened — twice, six months apart, in the same shape.
//
// On 2026-09-10, `scripts/ops/analytics.ts` held
// `const DATASET = "remy_sport_events"`. Every report therefore read
// production's table, and `--env staging` filtered that table by
// `environment = 'staging'` — a condition no row in it can satisfy, because
// staging writes somewhere else entirely. The result was not an error. It was
// an empty report, which is indistinguishable from a healthy silence. So
// `mail.sent` shipped, recorded 47 refused sends on staging, and the command
// built to read telemetry said `(nothing)`; the conclusion drawn was that the
// new counter was broken.
//
// Earlier, `CF_D1_NAME` was a mise literal pinned to production's database, so
// `migrations:apply:remote --env staging` migrated **production**. That one is
// written up in the header of scripts/db.ts, which was rewritten to resolve the
// name — and which had since grown a fresh `"remy-sport-db"` literal in its
// status block, found by this rule on the day it was added.
//
// That is why this checks every resource in `exclusive()` rather than only the
// one that just bit us. The shared property is what makes them dangerous: each
// name identifies **one** deployment, so a name written into code that runs for
// all of them silently serves the wrong one. And the symptom is never an
// exception — it is a plausible-looking answer about somewhere else.
//
// The fix is always the same: resolve it from wrangler config for the target in
// hand, as `databaseName` and `datasetFor` do.
//
// String literals only, via the AST. Several files discuss these names in
// prose — this one does, at length — and a comment naming a database is
// documentation, not a binding.
const owned = new Map<string, string>()
for (const { label, config } of resolved) {
  for (const [kind, names] of Object.entries(exclusive(config))) {
    // Route hosts are excluded: `originOf` already resolves them per target,
    // and a hostname legitimately appears in a CSP, a doc link and a test
    // fixture. Rule 3 covers the case that actually matters — a deployment
    // whose BETTER_AUTH_URL points at another environment's host.
    if (kind === "route host") continue
    for (const name of names) if (!owned.has(name)) owned.set(name, `${kind} of ${label}`)
  }
}
for (const path of [...sources("src"), ...sources("scripts")]) {
  const parsed = parse(path)
  walk(parsed.program, (node) => {
    if (node.type !== "Literal" || typeof node.value !== "string") return
    const owner = owned.get(node.value)
    if (!owner) return
    problems.push(
      `${path}:${lineOf(parsed, node)} names "${node.value}" — the ${owner}.\n` +
        `      These are per-environment by rule 1, so a name in code acts on one\n` +
        `      deployment whatever --env the caller passed, and reports the others as\n` +
        `      empty rather than as an error. Resolve it from wrangler config for the\n` +
        `      target in hand — see databaseName() in scripts/db.ts.`,
    )
  })
}

// ── 5. One reader for `--env` ────────────────────────────────────────────────
//
// `--env staging` and `--env=staging` are both typed, and a reader that knows
// only one of them does not fail on the other. It reports "no environment
// named" and falls through to the default, which is production. Silently, and
// about the wrong deployment.
//
// Both halves of that have now happened. `ops analytics` accepted only
// `--env=`, so `--env staging` reported production's telemetry under a heading
// that did not say which environment it was. `ops docs` accepted only `--env `,
// so `docs check --env=staging` ran a **local** check while the caller believed
// they were asking about a deployment — and a local check's output looks like a
// remote one's.
//
// So the parse lives in `namedEnvironment`, once, and this keeps it there. The
// literal `--env=` is the tell: nothing needs to write that except a parser, and
// a file that writes it has started a second one.
//
// Passing `"--env"` to a child process is untouched by this — that is
// *constructing* an argument, which deploy.ts and demo.ts legitimately do, and
// it is `"--env"` without the `=`.
for (const path of sources("scripts")) {
  if (path === "scripts/lib/cloudflare.ts") continue
  const parsed = parse(path)
  walk(parsed.program, (node) => {
    if (node.type !== "Literal" || typeof node.value !== "string") return
    if (!node.value.startsWith("--env=")) return
    problems.push(
      `${path}:${lineOf(parsed, node)} parses "${node.value}" itself.\n` +
        `      Use namedEnvironment() from scripts/lib/cloudflare.ts. A second reader is a\n` +
        `      second chance to know only one spelling, and the failure is not an error —\n` +
        `      it is the default environment, reported as though it were the one asked for.`,
    )
  })
}

rule(
  "no two environments share anything that carries data or traffic",
  problems,
  `check-envs: ${problems.length} problem(s) across ${resolved.length} environment(s):\n` +
    problems.map((p) => `  ✗ ${p}`).join("\n\n"),
  `check-envs: ${resolved.length} environment(s) resolve disjointly — ` +
    resolved
      .map(({ label, config }) => `${label} → ${hostsOf(config).join(",") || "no route"}`)
      .join(", "),
)
