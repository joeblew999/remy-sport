/**
 * Run `check --fast` whenever a source file changes.
 *
 * The point is the 1.75s, not the watching. A check you have to ask for gets
 * run at the end of a change; a check that has already run is a check you read.
 * `verify` was 8.6s until this morning, which is long enough that you start
 * batching edits to avoid it — and batching edits is how five minutes of work
 * turns into a page of errors.
 *
 * `dev` already watches for the browser: vite rebuilds the bundle in ~18ms. What
 * nothing watched was correctness.
 *
 * No new dependency. `fs.watch` with `recursive` is native on macOS and Linux,
 * and this is a few dozen lines — a watcher package would be more code in
 * node_modules than in the repo.
 */

import { watch } from "fs"
import { spawn } from "child_process"

const ROOTS = ["src", "tests", "scripts"]

/**
 * Paths whose changes must not trigger a run.
 *
 * `src/paraglide` is the one that matters and it is not an optimisation:
 * `verify` depends on `i18n:generate`, which compiles the messages *into*
 * src/paraglide. Watching it means every run triggers the next one, forever, at
 * full CPU. The .tsbuildinfo caches are the same story one step removed.
 */
const IGNORED = [/^src\/paraglide\//, /\.tsbuildinfo/, /(^|\/)\./]

const WATCHED = /\.(ts|tsx|json)$/

/** Debounce, because one save from an editor is several fs events. */
const QUIET_MS = 150

let timer: ReturnType<typeof setTimeout> | null = null
let running = false
/** A change that arrived mid-run. Runs once when the current one finishes. */
let pending = false

function verify(): void {
  running = true
  const started = Date.now()
  // Inherited stdio: the point is to read the errors, and a wrapper that
  // captured and re-printed them would only add a layer to be wrong about.
  const child = spawn("bun", ["scripts/check.ts", "--fast"], { stdio: "inherit" })
  child.on("exit", (code) => {
    const secs = ((Date.now() - started) / 1000).toFixed(1)
    console.log(
      code === 0
        ? `\x1b[32m  watch: clean in ${secs}s\x1b[0m`
        : `\x1b[31m  watch: failed in ${secs}s\x1b[0m`,
    )
    running = false
    if (pending) {
      pending = false
      schedule()
    }
  })
}

function schedule(): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    // Never two at once: a second tsc against the same .tsbuildinfo is both
    // slower and a way to write a half-finished cache.
    if (running) pending = true
    else verify()
  }, QUIET_MS)
}

for (const root of ROOTS) {
  watch(root, { recursive: true }, (_event, file) => {
    if (!file) return
    const path = `${root}/${file}`
    if (IGNORED.some((re) => re.test(path))) return
    if (!WATCHED.test(path)) return
    schedule()
  })
}

console.log(`watch: ${ROOTS.join(", ")} — saving a file runs verify. Ctrl-C stops.`)
verify()
