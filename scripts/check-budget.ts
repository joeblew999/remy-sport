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
    measured: 12.6,
    shared: { ceiling: 45, measured: 26.8 },
    note: "workerd plus D1 migrations per file; isolatedStorage pays that eight times",
  },
  render: {
    ceiling: 30,
    measured: 17.0,
    shared: { ceiling: 35, measured: 19.4 },
    note: "WebKit launch dominates; the slowest single test is under a second",
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
