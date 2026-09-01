/**
 * The gate, as a list of steps rather than a shell line.
 *
 * It was two `:::` fan-outs inside a TOML string naming twenty tasks, each of
 * which existed only so the fan-out had something to name. That is why this
 * repo had ninety-odd tasks: a mise task was the only way to invoke work, so
 * every step of everything became one.
 *
 * Here the steps are data. The two phases are still two phases, and the split is
 * not arbitrary — see PHASES below.
 */

import { prepare } from "./prepare"

import { spawn } from "child_process"

export interface Step {
  name: string
  cmd: string[]
  env?: Record<string, string>
  /** Report elapsed ms to check-budget under this key when set. */
  budget?: string
}

const bun = (...args: string[]) => ["bun", ...args]
const script = (file: string, ...args: string[]) => bun(`scripts/${file}`, ...args)

/**
 * The heavy tier, alone, then everything cheap.
 *
 * Not one group of twenty-two: with the worker and render suites in the same
 * pile as the cheap work the gate took 33s, because both slowed down more than
 * the cheap work saved. Measured over five samples each, the two-phase split is
 * 40.6/41.1/41.8s against 41.6/46.6/51.6s in one — and the spread mattering more
 * than the median is the point, since twelve seconds of run-to-run variance is
 * what made the budget flaky.
 *
 * RENDER_WORKERS caps Playwright for this phase only: the two tiers want ~17
 * processes on twelve cores, and uncapped they cost each other more than the
 * parallelism buys. BUDGET_SHARED tells check-budget which ceiling applies —
 * test:worker is 12.6s alone and 26.8s beside render, which is the gate doing
 * its job rather than a regression, and one ceiling cannot describe both.
 */
/**
 * The end-to-end tier, which `check` deliberately does not run.
 *
 * It needs a dev server and takes minutes; the gate is the fast feedback loop
 * and `deploy` runs this separately before it ships. Modelled here anyway so
 * there is one place that knows how a tier is timed.
 */
export const E2E: Step = { name: "e2e", cmd: bun("x", "playwright", "test"), budget: "e2e" }

export const PHASES: Step[][] = [
  [
    {
      name: "render",
      cmd: bun("x", "playwright", "test", "--config", "playwright.render.config.ts"),
      env: { RENDER_WORKERS: "3", BUDGET_SHARED: "1" },
      budget: "render",
    },
    {
      name: "worker",
      cmd: bun("x", "vitest", "run", "--config", "vitest.config.ts", "--exclude", "tests/worker/assets.test.ts"),
      env: { BUDGET_SHARED: "1" },
      budget: "worker",
    },
  ],
  [
    { name: "typecheck:worker", cmd: bun("x", "tsc", "--noEmit", "-p", "tsconfig.json", "--incremental", "false") },
    { name: "typecheck:spa", cmd: bun("x", "tsc", "--noEmit", "-p", "src/web/tsconfig.json", "--incremental", "false") },
    { name: "typecheck:tests", cmd: bun("x", "tsc", "--noEmit", "-p", "tsconfig.tests.json", "--incremental", "false") },
    { name: "unit", cmd: bun("test", "tests/unit/"), budget: "unit" },
    { name: "worker:assets", cmd: bun("x", "vitest", "run", "--config", "vitest.config.ts", "tests/worker/assets.test.ts") },
    { name: "dead", cmd: bun("x", "knip", "--include", "files,unlisted", "--no-config-hints") },
    { name: "deps", cmd: bun("x", "depcruise", "src", "--config", ".dependency-cruiser.cjs") },
    { name: "i18n", cmd: bun("x", "eslint", "src/web") },
    { name: "i18n:validate", cmd: bun("x", "inlang", "validate", "--project", "./project.inlang") },
    { name: "docs", cmd: script("checks/check-docs.ts") },
    { name: "authz", cmd: script("checks/check-authz.ts") },
    { name: "conventions", cmd: script("checks/check-conventions.ts") },
    { name: "seed:order", cmd: script("checks/check-seed-order.ts") },
    { name: "domain", cmd: script("domain.ts", "--check") },
    { name: "tables", cmd: script("checks/check-tables.ts") },
    { name: "assets", cmd: script("checks/check-assets.ts") },
    { name: "messages", cmd: script("checks/check-messages.ts") },
    { name: "notifications", cmd: script("checks/check-notifications.ts") },
    { name: "gui", cmd: script("gui-coverage.ts") },
    { name: "bundle", cmd: script("checks/check-bundle.ts") },
    { name: "envs", cmd: script("checks/check-envs.ts") },
    { name: "seed", cmd: script("seed.ts", "--check") },
  ],
]

export function run(step: Step): Promise<{ name: string; ok: boolean }> {
  return new Promise((resolve) => {
    const started = Date.now()
    const child = spawn(step.cmd[0]!, step.cmd.slice(1), {
      stdio: "inherit",
      env: { ...process.env, ...step.env },
    })
    child.on("exit", (code) => {
      const ok = code === 0
      if (ok && step.budget) {
        // Timed, and the number is printed on every run. A tier that got six
        // times slower went unnoticed for a whole session because nothing ever
        // said how long it took — see scripts/checks/check-budget.ts.
        spawn("bun", ["scripts/checks/check-budget.ts", step.budget, String(Date.now() - started)], {
          stdio: "inherit",
          env: { ...process.env, ...step.env },
        }).on("exit", () => resolve({ name: step.name, ok }))
        return
      }
      resolve({ name: step.name, ok })
    })
  })
}

export async function gate(phases: Step[][]): Promise<string[]> {
  let failed: string[] = []
  for (const phase of phases) {
    const results = await Promise.all(phase.map(run))
    failed = failed.concat(results.filter((r) => !r.ok).map((r) => r.name))
    // A failing heavy tier stops the cheap phase: there is nothing to learn from
    // twenty green checks beside a red suite, and the gate is faster when it stops.
    if (failed.length) break
  }
  return failed
}

/**
 * `--fast` is the six-second loop: typecheck and unit tests only.
 *
 * A mode rather than a second script, because the steps are the same steps. A
 * separate file restating "how do you typecheck this project" is how the two
 * drift.
 */
const FAST = new Set(["typecheck:worker", "typecheck:spa", "typecheck:tests", "unit"])

if (import.meta.main) {
  // The gate owns its prerequisites: deps, fonts, the bundle, worker types.
  // These were four mise tasks whose only content was `depends`.
  prepare()
  const fast = process.argv.includes("--fast")
  const e2e = process.argv.includes("--e2e")
  const phases = e2e ? [[E2E]] : fast ? [PHASES.flat().filter((s) => FAST.has(s.name))] : PHASES
  const failed = await gate(phases)
  if (failed.length) {
    console.error(`\ncheck: ${failed.length} failed — ${failed.join(", ")}\n`)
    process.exit(1)
  }
  if (fast) {
    // A nudge, not a gate. Touching code a heavy tier covers is worth a sentence
    // before you commit; it is not worth six seconds becoming forty.
    const changed = Bun.spawnSync(["git", "diff", "--name-only", "HEAD"]).stdout.toString()
    const tier = /src\/(api|db|domain)\//.test(changed)
      ? "the worker suite"
      : /src\/web\//.test(changed)
        ? "the render suite"
        : null
    if (tier) console.log(`  you touched code ${tier} covers — run 'mise run check' before you commit`)
  }
  console.log(`\ncheck: green${e2e ? " (e2e)" : fast ? " (fast)" : ""}\n`)
}
