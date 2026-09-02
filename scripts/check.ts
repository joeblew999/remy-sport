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

import { prepare, webWatcherRunning } from "./lib/prepare"

import { spawn } from "child_process"
import { existsSync } from "fs"

export interface Step {
  name: string
  cmd: string[]
  env?: Record<string, string>
  /** Report elapsed ms to check-budget under this key when set. */
  budget?: string
}

interface Budget {
  /** Seconds the tier may take, running on its own, before this fails. */
  ceiling: number
  /** What it took when the budget was set, so drift is legible. */
  measured: number
  /**
   * The same pair for a tier sharing the machine inside `check`. Absent where a
   * tier never runs that way, and then the solo ceiling applies everywhere.
   */
  shared?: { ceiling: number; measured: number }
  /** What dominates the time, so a breach has somewhere to start looking. */
  note: string
}

const BUDGETS: Record<string, Budget> = {
  unit: {
    ceiling: 5,
    measured: 0.35,
    note: "pure logic, no runtime at all — anything here is a runaway loop",
  },
  worker: {
    ceiling: 25,
    measured: 16.2,
    /*
     * Shared ceiling raised 2026-09-01, after it failed one `check` run in
     * three. Same reasoning as render's below, and the same mistake underneath
     * it: the ceiling was set from a single measurement (40.8s) against a
     * distribution nobody had characterised.
     *
     * Six consecutive shared samples: 39.3, 41.0, 41.6, 41.9, >45, 42.2 — mean
     * ~42, with a tail past the ceiling. Nine percent of headroom over a mean is
     * not headroom, it is a coin flip, and a gate that fails a third of the time
     * for no reason teaches you to re-run it. That habit is the thing being
     * protected here, not the seconds.
     *
     * Re-measured 2026-09-01 after authz-equivalence.test.ts came down from
     * 11.8s to 7.9s solo: shared is now 34.8 / 36.0 / 36.6, so the ceiling has
     * grown headroom rather than being tightened. That file was asking the same
     * (relation, actor, object) question thousands of times over a 20,790-row
     * cross-product; memoising the reads — not shrinking the matrix, and not
     * touching the oracle's algorithm — removed most of it.
     *
     * Re-set 2026-09-01 once the contention was actually measured. `check` now
     * caps Playwright at three workers for phase 1 (see
     * playwright.render.config.ts), and this tier stops being starved: shared
     * samples are 22.4 / 23.1 / 24.7 / 26.5, against 36.6 before.
     *
     * So the ceiling comes DOWN from 55 to 40. It was raised to 55 when the
     * shared figure was 42 with a tail past 45, and leaving it there over a
     * measured 24 would let this tier take half again as long as it does with
     * nobody noticing — which is the exact failure this file exists for. 40 is
     * ~3x the observed spread of headroom, which is the ratio render has too.
     */
    shared: { ceiling: 40, measured: 24.7 },
    // Re-measured 2026-08-31. The old note said "isolatedStorage pays that
    // eight times", which reads as a sum — vitest runs files in parallel, so
    // the tier costs its slowest file, not the total. It had crept to 24.5s
    // solo because write.test.ts alone was 21.5s; splitting it by subject took
    // the tier to 16.2s with the same 350 tests. See tests/worker/schedule.test.ts.
    note: "the slowest single file, not the sum — files run in parallel over a ~5s workerd floor",
  },
  render: {
    ceiling: 35,
    measured: 26.7,
    /*
     * Measured 34.2 / 34.3 / 35.3 / 35.7 as of 2026-09-01, up from 31.0 — this
     * tier now runs on three workers inside `check` rather than six, and gives
     * back more than it loses: total `check` went 50.8s to 41.8s median, and its
     * run-to-run spread went from 12.1s to 1.4s.
     *
     * The ceiling stays at 45. Headroom is 9s against a spread of 1.5s — six
     * times the noise — so it is not the flaky kind of tight, and lowering it to
     * match the higher measurement would remove the room the cap just bought.
     */
    shared: { ceiling: 45, measured: 35.3 },
    /*
     * Raised 2026-09-01, deliberately, after it flaked a `check` run at 100% of
     * a 35s shared ceiling. A flaky gate is worse than a slow one: the first
     * time somebody re-runs `check` to see whether it passes on the second go,
     * the signal is gone, and that habit does not come back.
     *
     * Measured before choosing, and the measurement decided it. One trivial
     * spec takes 27.2s. All 201 take 26.7s. **The tests cost nothing
     * measurable over the harness** — the tier is `vite preview` booting and
     * WebKit launching, and 201 assertions are lost in the noise of that.
     *
     * So the two obvious fixes are both wrong here. Sharding makes it worse:
     * each shard pays the fixed cost again. Trimming cannot help: there is
     * nothing to trim, which is also why taking the no-backend per-route wait
     * from 700ms to 350ms bought headroom that did not survive one spec being
     * added — solo that trim was never visible, and under contention
     * everything stretches together.
     *
     * What remains is the ceiling, so it moves with its reason written down.
     * Shared samples across the flake: 27.9, 28.7, 30.9, 31.2, 35.3. The new
     * ceiling catches a ~45% regression, which for a fixed-cost tier means the
     * harness itself got slower — the only regression that can happen here.
     */
    note: "fixed cost: vite preview + WebKit launch. 201 tests cost no more than one",
  },
  e2e: {
    ceiling: 45,
    measured: 18.0,
    note: "real Worker, real D1, real sign-ins — the only tier where waiting is honest",
  },
}


/**
 * Report a tier's elapsed time against its ceiling, and fail if it is over.
 *
 * Was its own file under check/, where it read as an eleventh gate step beside
 * the ten real ones. It is not a step — it is how check times the steps it has —
 * so it lives with the runner that calls it.
 */
export function budgetFor(tier: string, elapsedMs: number, shared: boolean): boolean {
  const budget = BUDGETS[tier]
  if (!budget) {
    console.error(`budget: no budget for "${tier}". Known: ${Object.keys(BUDGETS).join(", ")}`)
    return false
  }
  const regime = shared && budget.shared ? budget.shared : budget
  const took = elapsedMs / 1000
  const share = Math.round((took / regime.ceiling) * 100)
  const line =
    `${tier}: ${took.toFixed(1)}s of ${regime.ceiling}s (${share}%)` +
    (shared && budget.shared ? " sharing" : "")

  if (took > regime.ceiling) {
    console.error(
      `\n\x1b[31m${line} — over budget.\x1b[0m\n` +
        `  It took ${regime.measured}s when this was set. ${budget.note}.\n` +
        `  Find what got slower before raising the ceiling: a tier that is allowed\n` +
        `  to creep is one nobody will ever speed up again.\n`,
    )
    return false
  }
  // Dim, on one line, every run. The number is the point — a budget nobody sees
  // until it fails is a budget that fails once and gets raised.
  console.log(`\x1b[2mbudget · ${line}\x1b[0m`)
  return true
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
  /**
   * Phase 0 — the generator, alone, because everything after it reads what it
   * writes.
   *
   * `seed` regenerates src/db/seed.sql from the model and fails if the result
   * differs from the committed copy. It was in the cheap phase beside
   * `seed:order`, which reads that same file, and beside the worker tests, which
   * execute its bytes. One step writing a file twenty others read, concurrently.
   * It passed alone and failed inside the gate, which is the signature of a race
   * rather than a broken check.
   *
   * Cheap enough (~100ms) that serialising it costs nothing.
   */
  [{ name: "seed", cmd: script("lib/seed.ts", "--check") }],
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
    { name: "typecheck-worker", cmd: bun("x", "tsc", "--noEmit", "-p", "tsconfig.json", "--incremental", "false") },
    { name: "typecheck-spa", cmd: bun("x", "tsc", "--noEmit", "-p", "src/web/tsconfig.json", "--incremental", "false") },
    { name: "typecheck-tests", cmd: bun("x", "tsc", "--noEmit", "-p", "tsconfig.tests.json", "--incremental", "false") },
    { name: "unit", cmd: bun("test", "tests/unit/"), budget: "unit" },
    { name: "worker-assets", cmd: bun("x", "vitest", "run", "--config", "vitest.config.ts", "tests/worker/assets.test.ts") },
    { name: "dead", cmd: bun("x", "knip", "--include", "files,unlisted", "--no-config-hints") },
    { name: "deps", cmd: bun("x", "depcruise", "src", "--config", ".dependency-cruiser.cjs") },
    { name: "i18n", cmd: bun("x", "eslint", "src/web") },
    { name: "i18n-validate", cmd: bun("x", "inlang", "validate", "--project", "./project.inlang") },
    { name: "docs", cmd: script("check/docs.ts") },
    { name: "authz", cmd: script("check/authz.ts") },
    { name: "conventions", cmd: script("check/conventions.ts") },
    { name: "seed-order", cmd: script("check/seed-order.ts") },
    { name: "domain", cmd: script("ops/domain.ts", "--check") },
    { name: "tables", cmd: script("check/tables.ts") },
    { name: "assets", cmd: script("check/assets.ts") },
    { name: "messages", cmd: script("check/messages.ts") },
    { name: "notifications", cmd: script("check/notifications.ts") },
    { name: "coverage-gui", cmd: script("ops/coverage-gui.ts") },
    { name: "bundle", cmd: script("check/bundle.ts") },
    { name: "envs", cmd: script("check/envs.ts") },
  ],
]

/**
 * Every step's script exists, checked before any of them runs.
 *
 * These are spawned by string, so a path that moved fails as a confusing step
 * failure minutes in — "seed failed" when the truth is "there is no such file".
 * That has now happened twice from the same cause: a rename whose sed matched
 * `scripts/build/` and missed `script("build/...")`, which carries no prefix.
 */
/**
 * The dev bundler must not be running while a tier reads its output.
 *
 * `mise run 1-dev` runs `vite build --watch`, which rewrites dist/web on every
 * save. The render tier serves exactly that directory through `vite preview`,
 * and the e2e tier serves it through the Worker's [assets] binding — so a
 * rebuild landing mid-run is a page served with a chunk half-written, and it
 * surfaces as a timeout in whichever spec happened to be reading at the time.
 *
 * Different victims every run, passing when re-run alone, and nothing in the
 * output pointing at the cause. It cost a full investigation on 2026-09-02: I
 * measured three failures a run across five runs, stashed my changes, bisected
 * into a worktree, and the answer was a dev server I had left running. The
 * hazard was already written down in vite.config.ts and in AGENTS.md, which is
 * exactly why it needed to stop being something to remember.
 *
 * `--fast` is deliberately exempt. `1-dev -- watch` runs it on every save, it
 * reads no built bundle, and refusing there would break the loop this guard is
 * meant to protect.
 */
if (!process.argv.includes("--fast") && webWatcherRunning()) {
  console.error(
    "\ncheck: the dev bundler is running, and these tiers read what it is writing.\n" +
      "  `vite build --watch` rewrites dist/web on every save; the render tier serves\n" +
      "  that directory and the e2e tier ships it. A rebuild mid-run shows up as a\n" +
      "  timeout in an unrelated spec.\n\n" +
      "    mise run 1-dev -- stop     then run this again\n" +
      "    mise run 2-check -- --fast is safe with dev up — it reads no bundle\n",
  )
  process.exit(1)
}

for (const step of [...PHASES.flat(), E2E]) {
  const file = step.cmd[1]
  if (file?.startsWith("scripts/") && !existsSync(file)) {
    console.error(`check: step "${step.name}" points at ${file}, which does not exist`)
    process.exit(1)
  }
}

export function run(step: Step): Promise<{ name: string; ok: boolean }> {
  return new Promise((resolve) => {
    const started = Date.now()
    const child = spawn(step.cmd[0]!, step.cmd.slice(1), {
      stdio: "inherit",
      env: { ...process.env, ...step.env },
    })
    child.on("exit", (code) => {
      const ok = code === 0
      // Timed, and the number is printed on every run. A tier that got six
      // times slower went unnoticed for a whole session because nothing ever
      // said how long it took.
      if (ok && step.budget) {
        const within = budgetFor(step.budget, Date.now() - started, step.env?.BUDGET_SHARED === "1")
        return resolve({ name: step.name, ok: within })
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
const FAST = new Set(["typecheck-worker", "typecheck-spa", "typecheck-tests", "unit"])

if (import.meta.main && process.argv.includes("--help")) {
  console.log(`
mise run 2-check [-- --fast | --e2e]

  (no argument)  the whole gate, about 30s
  --fast         typecheck and unit tests only, about 6s
  --e2e          the end-to-end tier, which needs a dev server

What it runs:
`)
  PHASES.forEach((phase, i) => {
    console.log(`  phase ${i}${phase.length > 1 ? "  (these run in parallel)" : ""}`)
    for (const s of phase) console.log(`    ${s.name}`)
  })
  console.log("\n  A phase finishes before the next starts. Within one, there is no order.")
  console.log("  bun scripts/lib/prepare.ts --help  — what runs before all of this\n")
  process.exit(0)
}

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
    if (tier) console.log(`  you touched code ${tier} covers — run 'mise run 2-check' before you commit`)
  }
  console.log(
    `\ncheck: green${e2e ? " (e2e)" : fast ? " (fast)" : ""}\n` +
      (fast || e2e
        ? ""
        : "\n  Commit it, then:\n    mise run 3-deploy -- --env staging\n    mise run 3-deploy -- --env production\n"),
  )
}
