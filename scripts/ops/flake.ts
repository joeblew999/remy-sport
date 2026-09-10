/**
 * Run a test tier until it fails, and keep what it was doing when it did.
 *
 * The browser tier fails roughly one run in two, with a different spec nearly
 * every time — the signature of an environment problem rather than a broken
 * test. It has cost at least six deploy attempts, and it has been guessed at
 * twice and solved zero times, because every failure so far has been a sample
 * of one with no trace behind it.
 *
 * This is step 2 of docs/2026-09-09-18-browser-tier-flakiness.md: make one
 * failure reproducible and keep the evidence, so the next step reads a trace
 * instead of a spec name.
 *
 *   bun run ops flake                  # e2e, up to 10 runs
 *   bun run ops flake --runs 25        # keep going
 *   bun run ops flake --tier render    # the other browser tier
 *   bun run ops flake -- connected-gui # pass a filter through to Playwright
 *
 * It stops at the first failure — the point is to catch one, not to measure a
 * rate — and prints where the trace and the server log were left.
 */

import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, cpSync, writeFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "../..")
const KEEP = join(ROOT, ".playwright", "flake")

const help = `bun run ops flake [--runs N] [--tier e2e|render] [-- <playwright args>]

Runs the tier until it fails, then keeps the trace, the report and the output.
Stops at the first failure. Nothing is kept when a run passes.`

export async function runFlake(argv: string[]): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(help)
    return 0
  }

  const runsAt = argv.indexOf("--runs")
  const runs = runsAt === -1 ? 10 : Number(argv[runsAt + 1])
  if (!Number.isInteger(runs) || runs < 1) {
    console.error(`flake: --runs wants a whole number, got ${argv[runsAt + 1]}`)
    return 2
  }
  const tierAt = argv.indexOf("--tier")
  const tier = tierAt === -1 ? "e2e" : argv[tierAt + 1]
  if (tier !== "e2e" && tier !== "render") {
    console.error(`flake: --tier is e2e or render, got ${tier}`)
    return 2
  }
  // Everything after a bare `--` is Playwright's, not ours.
  const passThrough = argv.includes("--") ? argv.slice(argv.indexOf("--") + 1) : []

  console.log(`flake: ${tier}, up to ${runs} run(s), stopping at the first failure`)
  if (passThrough.length) console.log(`flake: passing through ${passThrough.join(" ")}`)

  for (let run = 1; run <= runs; run++) {
    const started = Date.now()
    const result = spawnSync(
      "bun",
      ["run", tier === "e2e" ? "test:e2e" : "test:render", ...(passThrough.length ? ["--", ...passThrough] : [])],
      { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    )
    const seconds = ((Date.now() - started) / 1000).toFixed(0)
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`
    // The tier prints its own tally; echoing the whole log per run would bury
    // the one line that matters.
    const tally = output.match(/^\s+\d+ (?:passed|failed).*$/gm)?.join(" / ") ?? "no tally"

    if (result.status === 0) {
      console.log(`flake: run ${run}/${runs} passed in ${seconds}s — ${tally}`)
      continue
    }

    // Keep everything, because a second failure may not come for an hour.
    mkdirSync(KEEP, { recursive: true })
    const kept = join(KEEP, `${new Date().toISOString().replace(/[:.]/g, "-")}-${tier}`)
    mkdirSync(kept, { recursive: true })
    writeFileSync(join(kept, "output.log"), output)
    for (const dir of ["test-results", "playwright-report"]) {
      if (existsSync(join(ROOT, dir))) cpSync(join(ROOT, dir), join(kept, dir), { recursive: true })
    }
    const traces = existsSync(join(kept, "test-results"))
      ? readdirSync(join(kept, "test-results"), { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith("trace.zip"))
      : []

    console.log(`\nflake: run ${run}/${runs} FAILED in ${seconds}s — ${tally}`)
    console.log(`flake: kept in ${kept.replace(`${ROOT}/`, "")}`)
    console.log(
      traces.length
        ? `flake: ${traces.length} trace(s). Read one with:\n  bunx playwright show-trace ${join(kept, "test-results", traces[0]!).replace(`${ROOT}/`, "")}`
        : `flake: no trace was written — check that \`trace\` is retain-on-failure in playwright.config.ts`,
    )
    return 1
  }

  console.log(`flake: ${runs} run(s), no failure. That is evidence too — record it in the plan.`)
  return 0
}

process.exitCode = await runFlake(process.argv.slice(2))
