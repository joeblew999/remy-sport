import { spawnSync } from "node:child_process"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Every command that takes an environment is asked which one it resolved.
 *
 * These scripts parse `process.argv` at module scope and export nothing, so a
 * process is the only way in. `REMY_TARGET_PROBE=1` makes `resolveTarget` print
 * what it chose and exit before the command acts.
 */

const ROOT = resolve(import.meta.dirname, "../..")

/**
 * How each command is entered, and what it may do with no `--env`.
 *
 * `ambient` may default to production; `explicit` must refuse; `local` runs
 * against localhost and resolves no deployment. Listed by hand because the rule
 * is a decision per command, not a property that can be derived.
 */
const COMMANDS: { name: string; argv: string[]; rule: "explicit" | "ambient" | "local" }[] = [
  { name: "deploy", argv: ["scripts/deploy.ts"], rule: "explicit" },
  // `local`: with no environment this is the ordinary run against
  // localhost:8788 and resolves no deployment at all.
  { name: "test:e2e", argv: ["scripts/e2e.ts"], rule: "local" },
  { name: "db migrate-remote", argv: ["scripts/db.ts", "migrate-remote"], rule: "explicit" },
  { name: "db seed-remote", argv: ["scripts/db.ts", "seed-remote"], rule: "explicit" },
  { name: "ops demo on", argv: ["scripts/ops/demo.ts", "on"], rule: "explicit" },
  { name: "ops provision", argv: ["scripts/ops/provision.ts"], rule: "explicit" },
  { name: "ops smoke", argv: ["scripts/deploy/smoke.ts"], rule: "ambient" },
  { name: "ops analytics", argv: ["scripts/ops/analytics.ts"], rule: "ambient" },
  { name: "ops demo status", argv: ["scripts/ops/demo-status.ts"], rule: "ambient" },
]

function run(argv: string[], extra: string[]) {
  const proc = spawnSync("bun", [...argv, ...extra], {
    cwd: ROOT,
    env: { ...process.env, REMY_TARGET_PROBE: "1" },
    encoding: "utf8",
    timeout: 60_000,
  })
  return `${proc.stdout ?? ""}${proc.stderr ?? ""}`
}

describe("every command resolves the environment it was given", () => {
  for (const { name, argv } of COMMANDS) {
    // Both spellings: a reader that knows one falls through to the default on
    // the other, silently.
    it(`${name} honours --env staging`, () => {
      expect(run(argv, ["--env", "staging"])).toContain("remy-target=staging")
    })

    it(`${name} honours --env=staging`, () => {
      expect(run(argv, ["--env=staging"])).toContain("remy-target=staging")
    })

    it(`${name} honours --env production`, () => {
      expect(run(argv, ["--env", "production"])).toContain("remy-target=production")
    })
  }
})

describe("a command with no environment does what its rule says", () => {
  for (const { name, argv, rule } of COMMANDS) {
    if (rule === "ambient") {
      it(`${name} defaults to production`, () => {
        expect(run(argv, [])).toContain("remy-target=production")
      })
    } else if (rule === "explicit") {
      it(`${name} refuses rather than defaulting`, () => {
        const out = run(argv, [])
        expect(out).not.toContain("remy-target=")
        expect(out).toContain("no target environment")
      })
    }
    // `local` has no case: running e2e with no environment starts a Worker and
    // drives browsers, which a repo test must not do. The branch it depends on
    // is covered in tests/unit/cloudflare-target.test.ts.
  }
})

/** A typo is refused, not answered with an empty report. */
it("a misspelt environment is refused", () => {
  const out = run(["scripts/ops/analytics.ts"], ["--env", "stagng"])
  expect(out).not.toContain("remy-target=")
  expect(out).toContain("not an environment")
})
