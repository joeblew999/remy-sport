/**
 * The rules this repo keeps, asserted against the tree.
 *
 * This is the third leg of `bun run check`, and the one that exists because of
 * how this repo is built. A rule written as prose rots: a human reading a stale
 * one thinks "that's not right, I remember"; an agent has no memory to
 * contradict it and builds on it instead. That is not hypothetical — the
 * project's notes once described a `translation` table that was never built,
 * and a task brief written from them later asked for code to preserve it.
 *
 * So the load-bearing rules live here, as checks, rather than in prose. If one
 * fails, one of two things is true and both need a human: the code regressed,
 * or the rule is no longer the rule and this file must change with it. Neither
 * should be resolved by deleting the check.
 *
 * What belongs here: a rule that a regression would silently violate, and that
 * is cheap to detect. What does not: anything a test already
 * covers (the old auth spec proved password sign-in is gone far better than
 * a grep could), and anything a type-checker catches.
 */

import { readFileSync, readdirSync, existsSync } from "fs"
import { join, resolve } from "path"
import { describe, it } from "vitest"

const ROOT = resolve(import.meta.dirname, "../..")
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
  /** The rule, in one sentence. Quoted, so a failure reads as the rule it broke. */
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
     * The cruiser rule `screens-never-decide` refuses `src/domain/grants.ts`
     * from the SPA, but `GRANTS` itself is exported from vocabularies.ts beside
     * the codes every page legitimately needs, and a module rule cannot forbid
     * one export. This can. A screen that reads the grant table is holding the
     * access matrix — the second copy the resolver exists to prevent — when
     * every answer it could want is already on the row as `can.<ACTION>`.
     */
    claim: '"A row answers by the model\'s action names … The SPA must not import it."',
    check: () => grepSrc(/\bGRANTS\b/).filter((loc) => loc.startsWith("src/web/")),
  },
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
      // Specs only. tests/repo holds rules about the tree — this one included,
      // and its own prose names `getByTestId("literal")` as an example.
      for (const path of walk("tests").filter((p) => !p.startsWith("tests/repo/"))) {
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
     * The docs are read at the start of every session, so a command named there
     * that no longer exists becomes wrong work rather than a confused reader.
     *
     * The docs test validates PATHS in the docs and could not see this: when
     * ninety-one mise tasks became six, twenty-odd `mise run` references rotted
     * in place and every gate stayed green. Same failure it already guards for
     * files, one column over. The commands are package.json scripts now, and
     * the rule follows them.
     */
    claim: '"Every `bun run` in the docs names a script in package.json."',
    check: () => {
      const scripts = new Set(
        Object.keys((JSON.parse(read("package.json")) as { scripts?: Record<string, string> }).scripts ?? {}),
      )
      const bad: string[] = []
      for (const doc of ["AGENTS.md", "README.md", "CLAUDE.md", "GEMINI.md"]) {
        const body = read(doc)
        body.split("\n").forEach((line, i) => {
          // Same escape the docs test uses for a path named on purpose.
          if (line.includes("<!-- docs-check-ignore -->")) return
          for (const [, name] of line.matchAll(/bun run ([a-z][\w:.-]*)/g)) {
            if (!scripts.has(name)) bad.push(`${doc}:${i + 1}  no such script: ${name}`)
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
      // `check.ts` and `dev.ts` were in this list and do not
      // exist — `check` is a chain of scripts in package.json and `dev` is
      // vite. `read` returns "" for a missing file, so this rule silently
      // checked two files while claiming four, and stayed green throughout.
      // Existence is asserted below so a renamed file fails loudly instead.
      for (const file of ["scripts/deploy.ts", "scripts/lib/prepare.ts", "scripts/model.ts"]) {
        if (!existsSync(join(ROOT, file))) {
          bad.push(`${file} is named by this rule and does not exist`)
          continue
        }
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
    claim: '"Never pass the platform `ac`/`roles` to a Better Auth plugin." — broke twice (ADR 009, ADR 013)',
    check: () => {
      const cfg = read("src/auth.config.ts")
      // The plugins must get their OWN scoped controllers (adminAc/adminRoles,
      // orgAc/orgRoles). Passing the bare platform `ac`/`roles` from
      // the old `access-control.ts` REPLACED the plugin's built-in roles, which
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

describe("the rules this repo keeps", () => {
  for (const rule of RULES) {
    it(rule.claim, () => {
      const hits = rule.check()
      if (hits.length === 0) return
      throw new Error(
        `BROKEN: ${rule.claim}\n` +
          hits.map((h) => `  ${h}`).join("\n") +
          `\n\nA failure means either the code regressed, or the rule is no longer the rule —\n` +
          `in which case change the rule here, in the same commit as the code.\n` +
          `Do not delete the check to make it pass.`,
      )
    })
  }
})

/**
 * Every `X_CODES` tuple lists exactly the codes its vocabulary declares.
 *
 * The model writes these as `X.map((t) => t.code) as unknown as ["A", "B"]`.
 * The runtime value is correct — it *is* the map — but the type is the hand
 * written tuple beside it, and `as unknown as` tells the compiler to accept
 * whatever is there. So the two can disagree and nothing notices: the code
 * behaves, the types lie, and the lie only surfaces when somebody finally uses
 * the type where it matters.
 *
 * `LOCALE_CODES` did exactly that. It claimed `["th", "en", "ja"]` from the day
 * a fourth language was added until twenty-seven were live, and it was found
 * only when `/api/reference` first took a locale as a typed input and the
 * compiler rejected `"ar"` as not being a locale.
 *
 * Twenty-three tuples share the shape, so this checks all of them rather than
 * the one that broke.
 */
const MODEL = readFileSync(resolve(import.meta.dirname, "../../src/domain/model/vocabularies.ts"), "utf8")

const drifted = [...MODEL.matchAll(
  /export const ([A-Z_]+)_CODES = ([A-Z_]+)\.map\(\(t\) => t\.code\) as unknown as \[\n((?:\s*"[^"]*",?\n)*)\s*\]/g,
)].flatMap(([, name, source, body]) => {
  const declared = [...body!.matchAll(/"([^"]*)"/g)].map((m) => m[1])
  // The vocabulary's own rows, read the same way the sync reads ALL_LOCALES.
  const block = MODEL.match(new RegExp(`export const ${source} = \\[(.*?)\\n\\] as const`, "s"))?.[1] ?? ""
  const actual = [...block.matchAll(/\{ code: "([^"]+)"/g)].map((m) => m[1])
  if (declared.length === actual.length && declared.every((c, i) => c === actual[i])) return []
  const missing = actual.filter((c) => !declared.includes(c!))
  const extra = declared.filter((c) => !actual.includes(c!))
  return [
    `${name}_CODES declares ${declared.length}, ${source} has ${actual.length}` +
      (missing.length ? ` — missing ${missing.join(", ")}` : "") +
      (extra.length ? ` — extra ${extra.join(", ")}` : ""),
  ]
})

it("every X_CODES tuple lists exactly the codes its vocabulary declares", () => {
  if (drifted.length === 0) return
  throw new Error(
    `BROKEN: a code tuple disagrees with its vocabulary\n` +
      drifted.map((d) => `  ${d}`).join("\n") +
      `\n\n\`as unknown as\` means the compiler cannot see this. The runtime value is\n` +
      `right and the type is wrong, so the code works until somebody uses the type.\n` +
      `Fix the tuple in the Product Owner's repo and run \`bun run ops domain\`.`,
  )
})
