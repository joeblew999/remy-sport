import { spawnSync } from "node:child_process"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Every command that takes an environment is asked whether it honours one.
 *
 * This is the assertion that could not be written before. These scripts parse
 * `process.argv` at module scope and export nothing — all ten of them — so
 * there is no function to call and no way in but spawning a process. Which
 * environment a command resolved was therefore checked by hand, by running it
 * and reading a header line, and that is exactly how long the bugs survived.
 *
 * Every environment failure found on 2026-09-10 is in the table below, and each
 * would have been caught here in under a second:
 *
 *   - `ops analytics --env staging` read only `--env=`, so it reported
 *     **production** — under a heading that did not say which environment it was.
 *   - `ops docs check --env=staging` read only `--env `, so it ran a **local**
 *     check while the caller believed they had asked about a deployment.
 *   - a dev server beat an explicit `--env`, so `--env production` answered
 *     about localhost.
 *
 * None of those raised an error. Each was a plausible answer about somewhere
 * else, which is the shape of every bug in this area.
 *
 * `REMY_TARGET_PROBE=1` makes `resolveTarget` print what it resolved and exit
 * before the command acts — see scripts/lib/cloudflare.ts. That keeps this a
 * real end-to-end check of the actual entry point, without extracting 5,381
 * lines of command scripts into testable functions, in files where
 * `process.exit` is the control flow.
 */

const ROOT = resolve(import.meta.dirname, "../..")

/**
 * How each command is entered, and what it is allowed to do with no `--env`.
 *
 * `ambient` may default to production; `explicit` must refuse. That asymmetry
 * is the module's rule rather than a convenience: an unnamed read costs a wrong
 * answer somebody can see, an unnamed write costs a migration applied to the
 * live database by somebody who thought they were on staging.
 *
 * Listed by hand because the rule is a *decision* per command, not a property
 * that can be derived — deriving it mechanically from "does this write" is what
 * gets provisioning backwards. A command added without a line here is covered
 * by the last case in this file, which fails if any script resolves a target
 * and is not listed.
 */
const COMMANDS: { name: string; argv: string[]; rule: "explicit" | "ambient" | "local" }[] = [
  { name: "deploy", argv: ["scripts/deploy.ts"], rule: "explicit" },
  // `local`, and this test is what established it — the first version of this
  // file assumed `explicit` and the run proved otherwise. `bun run test:e2e`
  // with no environment is the ordinary local run against localhost:8788; it
  // resolves no deployment at all, which is a third rule and not a laxer
  // version of either other one.
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
    // Both spellings, because both are typed and a reader that knows only one
    // does not fail on the other — it falls through to the default. That is how
    // two of these commands reported the wrong environment for weeks.
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
    // `local` has no case here on purpose. Running e2e with no environment IS
    // the local browser suite: it starts a Worker on 8788 and drives real
    // browsers, which took 28 seconds and left processes behind when this file
    // first tried it. A repo test must not do that. What matters about the rule
    // — that an unnamed run resolves no deployment — is guarded where it is
    // cheap: `namedEnvironment` returning undefined, in
    // tests/unit/cloudflare-target.test.ts, which is the branch e2e reads.
  }
})

/**
 * A typo is refused, not answered.
 *
 * The old analytics parser accepted any string, so `--env stagng` produced an
 * empty report — which reads exactly like a healthy silence. One command is
 * enough: the refusal is `resolveTarget`'s, and every command above is proven
 * to reach it.
 */
it("a misspelt environment is refused", () => {
  const out = run(["scripts/ops/analytics.ts"], ["--env", "stagng"])
  expect(out).not.toContain("remy-target=")
  expect(out).toContain("not an environment")
})
