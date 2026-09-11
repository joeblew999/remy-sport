/**
 * No two environments may share anything that carries data or traffic.
 *
 * ## Why this reads resolved config and not wrangler.toml
 *
 * The keys wrangler does not inherit are safe: it warns and the binding is
 * absent. The inherited ones are dangerous, because inheriting is legal —
 * `routes` is inherited, so an `[env.staging]` with no override resolves to
 * production's hostname and `deploy --env staging` publishes a staging build
 * onto the domain real people use.
 *
 * Wrangler warns about that only by luck: with `custom_domain = true` the dry
 * run says so unmissably, and with an ordinary route pattern it says nothing at
 * all. So the protection is conditional on a config detail unrelated to
 * environments, and this does not care which kind of route it is.
 *
 * Reading the TOML would not catch it, because the hazard is what is *absent*.
 * Cloudflare's own inheritable-keys documentation is wrong here too, omitting
 * three keys wrangler warns about. Resolved config is the only trustworthy
 * source.
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
// Rule 1 keeps the environments' resources distinct; this keeps the *tools*
// honest about that, which is a separate failure and has happened twice.
//
// A telemetry report held its dataset as a constant, so every report read
// production's table and `--env staging` filtered it by a condition no row
// there can satisfy — an empty report, indistinguishable from a healthy
// silence. Earlier, a literal database name pinned `migrations:apply:remote
// --env staging` to **production**.
//
// Every resource in `exclusive()` is checked, not just the one that last bit
// us: each name identifies one deployment, so a name in code that runs for all
// of them silently serves the wrong one, and the symptom is never an exception.
//
// The fix is always to resolve it from wrangler config for the target in hand.
//
// String literals only, via the AST — a comment naming a database is
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
// Both spellings are typed, and a reader that knows one falls through to the
// default on the other — silently, about the wrong deployment. Both halves have
// happened: one command knew only the joined form and reported production, and
// another knew only the separated form and ran a local check.
//
// So the parse lives in `namedEnvironment`, once. The literal `--env=` is the
// tell: nothing writes that except a parser.
//
// Constructing `"--env"` for a child process is untouched — that has no `=`.
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

/**
 * The Worker reads no compile-time build constant.
 *
 * `__BUILD__` is the SPA's, substituted by src/web/vite.config.ts. In Worker
 * code it would be a value that differs across dev, staging and production
 * with neither POLICY nor provisioning knowing — and present only where the
 * substitution ran. It does not run in the worker test pool, which builds from
 * wrangler.toml, so `/api/versions` answered a bare 500 there for as long as
 * the Worker read it, unnoticed because the endpoint was a raw route with no
 * test. The stamp is `env.BUILD`, a var, like every other per-environment
 * value. See src/build.d.ts.
 *
 * `.d.ts` files are not in `sources`, so the declaration itself is exempt
 * without naming an exception.
 */
const defines: string[] = []
for (const path of sources("src")) {
  if (path.startsWith("src/web/")) continue
  const parsed = parse(path)
  walk(parsed.program, (node) => {
    if (node.type !== "Identifier" || node.name !== "__BUILD__") return
    defines.push(`${path}:${lineOf(parsed, node)}`)
  })
}

rule(
  "no Worker module reads the SPA's build define",
  defines,
  `check-envs: ${defines.length} Worker reference(s) to __BUILD__\n\n` +
    defines.map((d) => `  ${d}`).join("\n") +
    "\n\nRead `env.BUILD` instead — wrangler.toml carries a placeholder and\n" +
    "scripts/deploy/build-config.ts writes the real stamp into the generated\n" +
    "config. A define is absent wherever Vite did not substitute it.",
  "check-envs: no Worker module reads __BUILD__",
)
