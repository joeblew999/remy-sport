/**
 * Assert the rules AGENTS.md states, against the tree.
 *
 * This is the third leg of `mise run check`, and the one that exists because of
 * how this repo is built. Every session an agent reads AGENTS.md and believes
 * it. A human reading a stale rule thinks "that's not right, I remember"; an
 * agent has no memory to contradict it and builds on it instead. That is not
 * hypothetical — AGENTS.md described a `translation` table that was never
 * built, and a task brief written from it later asked for code to preserve it.
 *
 * So the load-bearing claims are enforced rather than merely written. If a rule
 * here fails, one of two things is true and both need a human: the code
 * regressed, or the rule is no longer the rule and AGENTS.md must change with
 * it. Neither should be resolved by deleting the check.
 *
 * What belongs here: a rule AGENTS.md states, that a regression would silently
 * violate, and that is cheap to detect. What does not: anything a test already
 * covers (`tests/auth.spec.ts` proves password sign-in is gone far better than
 * a grep could), and anything a type-checker catches.
 */

import { readFileSync, readdirSync, existsSync } from "fs"
import { join, resolve } from "path"

const ROOT = resolve(import.meta.dir, "..")
const read = (p: string) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf-8") : "")

/** Every .ts/.tsx under src/, minus the generated trees. */
function sources(): { path: string; body: string }[] {
  const out: { path: string; body: string }[] = []
  const walk = (dir: string) => {
    for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (p.includes("paraglide")) continue
      if (e.isDirectory()) walk(p)
      else if (/\.tsx?$/.test(e.name)) out.push({ path: p, body: readFileSync(join(ROOT, p), "utf-8") })
    }
  }
  walk("src")
  return out
}

const migrations = readdirSync(join(ROOT, "src/db/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .map((f) => ({ path: `src/db/migrations/${f}`, body: read(`src/db/migrations/${f}`) }))

interface Rule {
  /** The AGENTS.md claim this enforces. Quoted, so a reader can find it. */
  claim: string
  /** Returns [] when the rule holds, or the offending locations. */
  check: () => string[]
}

const src = sources()
const grepSrc = (re: RegExp) =>
  src.flatMap(({ path, body }) =>
    body
      .split("\n")
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => re.test(line) && !/^\s*(\/\/|\*|--)/.test(line))
      .map(({ n }) => `${path}:${n}`),
  )

const RULES: Rule[] = [
  {
    claim: '"There is no `translation` table." — Languages are rows',
    check: () =>
      [...migrations, ...src]
        .filter(({ body }) => /CREATE TABLE[^;]*\btranslation\b|sqliteTable\(\s*["']translation["']/i.test(body))
        .map(({ path }) => path),
  },
  {
    claim: '"There is no `nameTh` field anywhere and there should never be one again."',
    // Current schema only. Migrations are append-only history — 0005 and 0006
    // created `name_th` and 0010 dropped it, and all three must keep saying so.
    // Comments are excluded too: the clearest statements of this rule live in
    // `src/domain/names.ts` and would otherwise fail the rule they assert.
    check: () =>
      src
        .filter(({ path }) => /db\/[a-z-]*schema\.ts$/.test(path))
        .flatMap(({ path, body }) =>
          body
            .split("\n")
            .map((line, i) => ({ line, n: i + 1 }))
            .filter(({ line }) => /\bname_th\b|\bnameTh\b/.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line))
            .map(({ n }) => `${path}:${n}`),
        ),
  },
  {
    claim: '"`emailAndPassword` is off." — Sign-in is passwordless',
    check: () => {
      const cfg = read("src/auth.config.ts")
      const block = cfg.match(/emailAndPassword:\s*\{[^}]*\}/s)?.[0] ?? ""
      return /enabled:\s*false/.test(block) ? [] : ["src/auth.config.ts: emailAndPassword is not disabled"]
    },
  },
  {
    claim: '"There are no passwords anywhere, including the seed."',
    check: () => (/password/i.test(read("src/domain/model/entities.ts")) ? ["src/domain/model/entities.ts"] : []),
  },
  {
    claim: '"There is one environment." — no `[env.*]` in wrangler.toml',
    check: () =>
      read("wrangler.toml")
        .split("\n")
        .map((l, i) => ({ l, n: i + 1 }))
        .filter(({ l }) => /^\s*\[env\./.test(l))
        .map(({ n }) => `wrangler.toml:${n}`),
  },
  {
    claim: '"The dev tasks pass `--host localhost` and must keep doing so."',
    check: () => {
      const mise = read("mise.toml")
      // Named in AGENTS.md. A sixth entry point appearing without the flag is
      // the regression this catches — a task that silently simulates the
      // production hostname locally.
      const required = ["dev", "dev:seed", "dev:ensure", "dev:remote"]
      const missing = required.filter((task) => {
        const body = mise.split(new RegExp(`^\\[tasks\\.(?:"${task}"|${task})\\]`, "m"))[1]?.split("\n[tasks.")[0]
        return body !== undefined && /wrangler dev/.test(body) && !/--host localhost/.test(body)
      })
      const pw = read("playwright.config.ts")
      if (/wrangler dev/.test(pw) && !/--host localhost/.test(pw)) missing.push("playwright.config.ts webServer")
      return missing
    },
  },
  {
    claim: '"Never pass the platform `ac`/`roles` to a Better Auth plugin." — broke twice (ADR 009, ADR 013)',
    check: () => {
      const cfg = read("src/auth.config.ts")
      // The plugins must get their OWN scoped controllers (adminAc/adminRoles,
      // orgAc/orgRoles). Passing the bare platform `ac`/`roles` from
      // src/auth/access-control.ts REPLACES the plugin's built-in roles, which
      // is what made `owner` resolve to nothing and locked the admin out.
      return cfg
        .split("\n")
        .map((l, i) => ({ l, n: i + 1 }))
        .filter(({ l }) => /^\s*(ac|roles):\s*(ac|roles)\s*,?\s*$/.test(l))
        .map(({ n }) => `src/auth.config.ts:${n} passes the platform controller to a plugin`)
    },
  },
  {
    claim: '"the `hc`-based client is gone" — the SPA speaks oRPC (ADR 016)',
    check: () => grepSrc(/from\s+["']hono\/client["']/),
  },
]

let failed = 0
for (const rule of RULES) {
  const hits = rule.check()
  if (hits.length === 0) continue
  failed++
  console.error(`\nBROKEN: ${rule.claim}`)
  for (const h of hits) console.error(`  ${h}`)
}

if (failed > 0) {
  console.error(
    `\ncheck-conventions: ${failed} of ${RULES.length} rules broken.\n\n` +
      `Each rule mirrors a claim in AGENTS.md. A failure means either the code regressed,\n` +
      `or the rule is no longer the rule — in which case change AGENTS.md and this file\n` +
      `together, in the same commit. Do not delete the check to make it pass.`,
  )
  process.exit(1)
}

console.log(`check-conventions: ${RULES.length} rules from AGENTS.md hold`)
