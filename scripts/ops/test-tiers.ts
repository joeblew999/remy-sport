/**
 * How many tests sit in each tier, and how many are still in the wrong one.
 *
 * The suite is 1.6 minutes because of how many browser tests exist, not how
 * the runner is configured — optimising the runner bought 2.8m -> 1.6m and
 * then stopped dead. This makes the only number that matters visible.
 *
 * The tier rule is in AGENTS.md; this reports where the tests actually are.
 */
import { readdirSync, readFileSync } from "fs"
import { join, resolve } from "path"

const ROOT = resolve(import.meta.dir, "../..")
const read = (p: string) => readFileSync(join(ROOT, p), "utf-8")
const files = (dir: string, m: RegExp) => {
  try {
    return readdirSync(join(ROOT, dir)).filter((f) => m.test(f)).map((f) => `${dir}/${f}`)
  } catch {
    return []
  }
}
const count = (paths: string[], re: RegExp) =>
  paths.reduce((n, p) => n + (read(p).match(re)?.length ?? 0), 0)

// One directory per tier — no filename convention to keep in step.
const unit = files("tests/unit", /\.test\.ts$/)
const worker = files("tests/worker", /\.test\.ts$/)
const render = files("tests/render", /\.spec\.ts$/)
const e2e = files("tests/e2e", /\.spec\.ts$/)

const TEST = /^\s*(it|test)\(/gm
const row = (label: string, n: number, note = "") =>
  console.log(`  ${label.padEnd(30)} ${String(n).padStart(4)}  ${note}`)

console.log("\ntest tiers\n")
row("unit    bun, pure logic", count(unit, TEST))
row("worker  workerd, real D1", count(worker, TEST))
row("render  browser, no backend", count(render, TEST))
row("e2e     browser + real Worker", count(e2e, TEST), "<- target ~23")

const browserless = e2e
  .map((f) => [f, read(f).match(/\(\{\s*request\s*\}/g)?.length ?? 0] as const)
  .filter(([, n]) => n > 0)
  .sort((a, b) => b[1] - a[1])

if (browserless.length) {
  console.log("\nstill browserless in the e2e tier — convert these first:\n")
  for (const [f, n] of browserless) row(f.replace("tests/e2e/", ""), n)
}
console.log("\nthe rule for choosing a tier is in AGENTS.md\n")
