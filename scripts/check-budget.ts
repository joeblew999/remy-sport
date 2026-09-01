/**
 * How long a test tier is allowed to take, and what it actually took.
 *
 * This exists because a tier got six times slower and nobody noticed for a
 * whole session. The render suite has no network at all — every `/rpc` call is
 * answered 404 by the seed helper — so nothing in it can legitimately take
 * seconds. Playwright's default 30-second timeout meant that when a fixture
 * drifted, six broken tests spent three minutes waiting for elements that could
 * not exist. Passing runs still reported thirteen seconds, so the output never
 * looked wrong; the cost landed only on failures, which is precisely when a
 * fast loop matters.
 *
 * A number printed every run is the point. A budget that only fails at the
 * ceiling lets a regression sit at ninety per cent of it forever, and the first
 * anyone knows is when it breaks through. Seeing "14.0s of 30s" on every run is
 * what makes a jump to 25s something you notice the day it happens.
 *
 * ## Why not simply lower the ceilings
 *
 * Because these are wall-clock times on whatever machine is running them, and a
 * loaded laptop is legitimately slower than an idle one. The budgets are
 * roughly double the measured time: tight enough that a real regression trips
 * them, loose enough that a busy machine does not. The measured figure is
 * recorded beside each one so the gap is visible rather than mysterious.
 *
 * ## Two regimes, because the gate deliberately creates the second one
 *
 * `mise run test:worker` alone takes 12.6s. The same tier inside `mise run
 * check`, running beside `test:render`, takes 26.8s — and that is the gate doing
 * its job, not the tier regressing. Both heavy tiers on twelve cores is faster
 * overall (the gate went from ~37s to ~27s) and slower for each of them.
 *
 * One ceiling cannot describe both. A ceiling loose enough for the shared run
 * would let a solo regression to 25s pass unnoticed, which is the exact failure
 * this file was written for. So there are two, each measured in its own regime,
 * and `check` sets BUDGET_SHARED to say which applies.
 */

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
     * The tier is 16.6s alone. The 2.5x is contention with test:render, which is
     * the gate deliberately using the machine — not a regression. Whether that
     * contention can be *reduced* is a real question and a separate one: the
     * two tiers ask for ~17 processes on twelve cores, and capping Playwright's
     * workers to 3 moved the phase from 40.3s to 35.1s in a single sample —
     * while the same experiment at 4 came out *worse* than at 6, which is how I
     * know one sample cannot decide it. Not tuned here on that evidence.
     */
    shared: { ceiling: 55, measured: 36.6 },
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
    shared: { ceiling: 45, measured: 31.0 },
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

const [tier, elapsedMs] = process.argv.slice(2)
const budget = BUDGETS[tier ?? ""]

/**
 * Set by `check` for the tiers it runs side by side. Not inferred from load,
 * which would be a guess about the machine rather than a statement about how the
 * tier was invoked.
 */
const shared = process.env.BUDGET_SHARED === "1"

if (!budget) {
  console.error(`check-budget: no budget for "${tier}". Known: ${Object.keys(BUDGETS).join(", ")}`)
  process.exit(1)
}

const regime = shared && budget.shared ? budget.shared : budget
const took = Number(elapsedMs) / 1000
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
  process.exit(1)
}

// Dim, on one line, every run. The number is the point — a budget nobody sees
// until it fails is a budget that fails once and gets raised.
console.log(`\x1b[2mbudget · ${line}\x1b[0m`)
