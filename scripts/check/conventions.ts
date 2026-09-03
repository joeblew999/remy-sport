/**
 * Assert the rules AGENTS.md states, against the tree.
 *
 * This is the third leg of `mise run 2-check`, and the one that exists because of
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

const ROOT = resolve(import.meta.dir, "../..")
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
    /**
     * A testid a test names must be one a component actually renders.
     *
     * Rename `data-testid="push-toggle"` and nothing complains until a spec
     * times out five seconds later saying an element was not found — which is
     * the same message a genuinely broken feature gives, so the two are
     * indistinguishable until somebody reads the diff. This says which testid
     * and where, instantly.
     *
     * ## Matching a dynamic testid
     *
     * Most of them are built rather than written: `data-testid={`approve-${a.email}`}`
     * renders `approve-ref@remy.test`, and a spec names the concrete one. So the
     * templates are extracted and turned into patterns — every backtick literal
     * inside a `data-testid={...}` expression, brace-matched rather than
     * regexed, because one of them lives inside a ternary
     * (`a.statusCode === "PENDING_APPROVAL" ? `pending-${a.email}` : undefined`)
     * and a shallower reader misses it. Eighty-six templates, and the
     * difference between finding them and not is ninety-three false positives.
     *
     * Only STATIC uses are checked — `getByTestId("literal")`. A test that
     * builds its own testid cannot be resolved without running it, and guessing
     * would be the same false-positive problem from the other side.
     *
     * `// check-ignore` for a testid a test names in order to assert it is
     * GONE. There is one, and it is load-bearing: it holds the removal of a
     * status line that duplicated the button above it.
     */
    claim: '"A testid a test names is one a component renders."',
    check: () => {
      const templatesIn = (body: string): string[] => {
        const out: string[] = []
        for (const m of body.matchAll(/data-testid=\{/g)) {
          let i = m.index! + m[0].length
          let depth = 1
          while (i < body.length && depth > 0) {
            if (body[i] === "{") depth++
            else if (body[i] === "}") depth--
            i++
          }
          for (const t of body.slice(m.index! + m[0].length, i).matchAll(/`([^`]+)`/g)) out.push(t[1]!)
        }
        return out
      }

      const statics = new Set<string>()
      const patterns: RegExp[] = []
      for (const { body } of src) {
        for (const m of body.matchAll(/data-testid="([^"]+)"/g)) statics.add(m[1]!)
        for (const t of templatesIn(body)) {
          const rx = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\$\\\{[^}]*\\\}/g, ".+")
          patterns.push(new RegExp(`^${rx}$`))
        }
      }

      const bad: string[] = []
      const walk = (dir: string): string[] =>
        readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
          e.isDirectory() ? walk(`${dir}/${e.name}`) : e.name.endsWith(".ts") ? [`${dir}/${e.name}`] : [],
        )
      for (const path of walk("tests")) {
        read(path)
          .split("\n")
          .forEach((line, i) => {
            if (/check-ignore/.test(line)) return
            for (const m of line.matchAll(/getByTestId\("([^"]+)"\)/g)) {
              const id = m[1]!
              if (statics.has(id) || patterns.some((r) => r.test(id))) continue
              bad.push(`${path}:${i + 1}  getByTestId("${id}") — no component renders it`)
            }
          })
      }
      return bad
    },
  },

  {
    /**
     * The rule Phase 1 exists to make true, and this is what keeps it true.
     *
     * Moving the notification settings between two pages cost fifteen edits
     * across three specs, because a hundred and thirty `page.goto` calls knew
     * where things were. They name a surface now — `visit(page,
     * "notifications")` — so the same move is one line in
     * tests/helpers/surfaces.ts.
     *
     * Nothing stopped the next spec typing a route again, and a rule that must
     * be remembered is the same class of thing that already failed. This is the
     * mechanism.
     *
     * Two exemptions, both because the route IS the subject: specs that iterate
     * `ROUTES` from the router, and the crash beacon's test, which asserts what
     * route a report carries — "/" and "/#/discover" both render discover and
     * report differently. Marked with the same `docs-check-ignore` comment the
     * docs rule already uses, so an exemption is a deliberate line rather than
     * a pattern this has to guess at.
     */
    claim: '"A render spec names a surface, not a route." — tests/helpers/surfaces.ts',
    check: () => {
      const bad: string[] = []
      for (const file of readdirSync(join(ROOT, "tests/render")).filter((f) => f.endsWith(".spec.ts"))) {
        const path = `tests/render/${file}`
        read(path)
          .split("\n")
          .forEach((line, i) => {
            if (!/page\.goto\(/.test(line)) return
            if (/check-ignore/.test(line)) return
            bad.push(`${path}:${i + 1}  page.goto — use visit(page, "<surface>") from tests/helpers/surfaces.ts`)
          })
      }
      return bad
    },
  },
  {
    /**
     * The other half. Ten specs each wrote their own session object, and they
     * disagreed with the model and with each other — one seeded `usr_org_001`'s
     * id beside a fabricated email and a different person's name, and four
     * claimed `role: "user"`, which the model does not have.
     *
     * `sessionFor(role)` reads SEED_ENTITIES.users, so "as a coach" is the same
     * person the worker and e2e tiers mean.
     */
    claim: '"A render spec signs in as a seeded person." — tests/helpers/actors.ts',
    check: () => {
      const bad: string[] = []
      for (const file of readdirSync(join(ROOT, "tests/render")).filter((f) => f.endsWith(".spec.ts"))) {
        const path = `tests/render/${file}`
        read(path)
          .split("\n")
          .forEach((line, i) => {
            if (!/queryKey: sessionKey/.test(line)) return
            if (/check-ignore/.test(line)) return
            bad.push(`${path}:${i + 1}  hand-built session — use sessionFor(role) or VISITOR from tests/helpers/actors.ts`)
          })
      }
      return bad
    },
  },

  {
    /**
     * AGENTS.md is read at the start of every session, so a command named there
     * that no longer exists becomes wrong work rather than a confused reader.
     *
     * check:docs validates PATHS in the docs and could not see this: when
     * ninety-one tasks became six, twenty-odd `mise run` references rotted in
     * place and every gate stayed green. Same failure it already guards for
     * files, one column over.
     */
    claim: '"Every `mise run` in the docs names a task that exists."',
    check: () => {
      const tasks = new Set(
        [...read("mise.toml").matchAll(/^\[tasks\.(?:"([^"]+)"|([\w:.-]+))\]$/gm)].map(
          (m) => m[1] ?? m[2],
        ),
      )
      const bad: string[] = []
      for (const doc of ["AGENTS.md", "README.md", "CLAUDE.md", "GEMINI.md"]) {
        const body = read(doc)
        body.split("\n").forEach((line, i) => {
          // Same escape check:docs uses for a path named on purpose — this file
          // explains argument passing with `mise run a b`, which is prose.
          if (line.includes("<!-- docs-check-ignore -->")) return
          for (const [, name] of line.matchAll(/mise run ([a-z][\w:.-]*)/g)) {
            if (!tasks.has(name)) bad.push(`${doc}:${i + 1}  no such task: ${name}`)
          }
        })
      }
      return bad
    },
  },
  {
    /**
     * Naming drift is invisible to every other gate.
     *
     * typecheck, knip and docs all ask whether the thing RUNS. None of them ask
     * whether it reads. So `seed:order` kept a colon after the mise task it was
     * named for was deleted, `gui` ran coverage-gui, `vars` ran dev-vars, and
     * one step had a space in the middle of its name — every one of them green,
     * every one of them wrong, and all of them found by a person reading the
     * output rather than by anything here.
     */
    claim: '"A step is named for what it runs, and nothing uses a colon or a space."',
    check: () => {
      const bad: string[] = []
      for (const file of ["scripts/check.ts", "scripts/deploy.ts", "scripts/lib/prepare.ts", "scripts/dev.ts"]) {
        const body = read(file)
        for (const [, name] of body.matchAll(/name: "([^"]+)"/g)) {
          if (/[: ]/.test(name)) bad.push(`${file}: step "${name}" uses a colon or a space`)
        }
        // Where a step spawns a script, its name must be that file's stem.
        for (const [, name, path] of body.matchAll(/name: "([^"]+)", cmd: script\("([^"]+)"/g)) {
          const stem = path.split("/").pop()!.replace(/\.ts$/, "")
          if (name !== stem) bad.push(`${file}: step "${name}" runs ${stem}.ts`)
        }
      }
      return bad
    },
  },
  {
    claim:
      '"Authorisation is the model\'s answer, never a role string compared in a handler."',
    /**
     * The bug this catches, twice on 2026-08-28.
     *
     * Web Push resolved its audience by reading the `subscription` table, when
     * the model granted RECEIVE_TEAM_NOTIFICATIONS to a team's coaches and
     * players as well as its followers — so a head coach was told nothing about
     * their own game. And `teams.create` compared `user.role !== "admin"` to
     * decide whether to write a coaching row, a third spelling of a role code
     * that lives in the PO's vocabulary and in Better Auth.
     *
     * Both failed *open* and silently, which is why a rule is worth more than
     * remembering. The model answers this: `requireAction`, `can`, or
     * `holds(db, "PLATFORM_ADMIN", ...)`.
     *
     * src/api only — src/auth.config.ts configures Better Auth's own admin
     * plugin, which necessarily names the role it stores, and relations.ts is
     * the resolver that turns a role into an answer.
     */
    check: () =>
      grepSrc(/\.role\s*(===|!==)\s*["'](admin|coach|organizer|referee|player|spectator)["']/).filter(
        (loc) => loc.startsWith("src/api/") && !loc.startsWith("src/api/relations.ts"),
      ),
  },
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
    claim:
      '"A named environment declares everything it uses, and the policy table has to know its name."',
    /**
     * Every `[env.X]` in wrangler.toml must be a member of ENVIRONMENTS.
     *
     * This replaced "there is one environment", which stopped being true when
     * staging arrived. The residual hazard is narrower and worse: `environmentOf`
     * resolves an unrecognised name to **production**, so an `[env.preview]`
     * would run under production's policy — no seed route, real mail, and a
     * `sampleRate` of 10 — while every log line and the health endpoint said
     * "preview". Fail-safe, and still a lie about which rules are in force.
     *
     * Resource-level separation is `check:envs`, which reads resolved config.
     * This one is only about the name, which is the half that file cannot see:
     * a block named for an environment nobody declared is still perfectly
     * disjoint from every other.
     */
    check: () => {
      const known = new Set(
        [...read("src/environment.ts").matchAll(/"(dev|staging|production)"/g)].map((m) => m[1]),
      )
      // Deduped: one environment has many blocks — [env.x], [env.x.vars],
      // [[env.x.routes]] — and naming it once is the useful message.
      const declared = new Set(
        [...read("wrangler.toml").matchAll(/^\s*\[+env\.([A-Za-z0-9_-]+)/gm)].map((m) => m[1]!),
      )
      return [...declared]
        .filter((name) => !known.has(name))
        .map((name) => `wrangler.toml: [env.${name}] is not in ENVIRONMENTS (src/environment.ts)`)
    },
  },
  {
    claim: '"The dev tasks pass an explicit `--host` and must keep doing so."',
    check: () => {
      const mise = read("mise.toml")
      // Named in AGENTS.md. A new entry point appearing without the flag is the
      // regression this catches — a task that silently simulates the production
      // hostname locally.
      //
      // Any explicit host, not `localhost` specifically. `dev` passes the LAN
      // address so a phone can reach it, which serves the same invariant: the
      // point is that wrangler must not fall back to simulating the [[routes]]
      // custom domain. Sign-in works over both, because trustedOrigins derives
      // from the request URL (src/auth.ts) — verified over each in turn.
      const required = ["dev", "dev:ensure", "dev:remote"]
      const missing = required.filter((task) => {
        const body = mise.split(new RegExp(`^\\[tasks\\.(?:"${task}"|${task})\\]`, "m"))[1]?.split("\n[tasks.")[0]
        return body !== undefined && /wrangler dev/.test(body) && !/--host \S/.test(body)
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
