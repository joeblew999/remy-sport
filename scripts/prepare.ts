/**
 * What a command needs before it can do its work, owned by the commands
 * themselves.
 *
 * Twenty-odd mise tasks existed for exactly one reason: `depends = ["install"]`
 * followed by a single script call. The task was not the work — it was a name
 * for "run install first", because `depends` is the only ordering primitive a
 * task runner has. Scripts can just say it.
 *
 * Two levels, and the split is the one that stops a deploy touching local state:
 *
 *   prepare()  what any command needs to BUILD — deps, fonts, the SPA bundle,
 *              worker types. check and deploy need this and nothing more.
 *   local()    prepare plus what only a local run needs — .dev.vars, local
 *              migrations, browsers, fixtures. dev needs this.
 *
 * Everything here is idempotent and quiet when there is nothing to do, because
 * it runs at the head of every command.
 */

import { existsSync } from "fs"

function sh(argv: string[], quiet = true): number {
  const proc = Bun.spawnSync(argv, {
    stdout: quiet ? "ignore" : "inherit",
    stderr: quiet ? "pipe" : "inherit",
  })
  if (proc.exitCode !== 0 && quiet) process.stderr.write(proc.stderr?.toString() ?? "")
  return proc.exitCode ?? 1
}

/** Newer than every input, so nothing needs doing. */
function fresh(output: string, inputs: string[]): boolean {
  if (!existsSync(output)) return false
  const out = Bun.file(output).lastModified
  return inputs.every((i) => !existsSync(i) || Bun.file(i).lastModified <= out)
}

export function install(): void {
  if (fresh("node_modules/.bin", ["bun.lock", "package.json"])) return
  sh(["bun", "install"], false)
}

/**
 * The SPA bundle, deferring to the dev server's watcher when it holds the
 * directory.
 *
 * `dev` runs `vite build --watch` against this same config and output. Start a
 * second builder and whichever empties dist/web second leaves the other's output
 * gone — a window wide enough that an e2e suite once failed with "element not
 * found" on eight specs, because the shell was served with no bundle at all.
 * The watcher is authoritative when it exists: it is already rebuilding on every
 * save, so its output is at least as fresh as ours.
 *
 * This is the behaviour the mise task had, and it is restored deliberately. I
 * replaced it twice today — first waiting for the bundle to settle, then
 * refusing outright — on a theory that the render tier's flakiness came from
 * reading dist/web mid-write. It does not: that suite fails one run in three
 * with no watcher running at all. Both replacements were machinery built on a
 * diagnosis I had not confirmed.
 */
function webBuild(): void {
  const watching = Bun.spawnSync(
    ["pgrep", "-f", "vite build --config src/web/vite.config.ts --watch"],
    { stdout: "pipe", stderr: "ignore" },
  )
  if (watching.stdout.toString().trim() && existsSync("dist/web/index.html")) return
  sh(["bun", "x", "vite", "build", "--config", "src/web/vite.config.ts", "--logLevel", "warn"], false)
}

/**
 * The order, as a list, with each step saying why it is where it is.
 *
 * Every command runs one of these two before its own work, so this is the first
 * thing that happens in the repo and the last place an implicit ordering should
 * hide.
 */
interface Step {
  name: string
  why: string
  go: () => void
}

const BUILD: Step[] = [
  { name: "install", why: "everything below is a node_modules binary", go: install },
  {
    name: "fonts",
    why: "writes src/web/fonts.css, which styles.css imports on its first line — so it precedes the bundle that reads it",
    go: () => sh(["bun", "scripts/build/2-fonts.ts"]),
  },
  { name: "bundle", why: "dist/web is gitignored and the [assets] binding points at it, so a fresh clone has none", go: webBuild },
  { name: "types", why: "worker-configuration.d.ts is generated from the bindings, and the typecheck reads it", go: () => sh(["bun", "x", "wrangler", "types"]) },
]

const LOCAL: Step[] = [
  { name: "vars", why: ".dev.vars before anything runs the Worker, including the tests", go: () => sh(["bun", "scripts/dev/5-dev-vars.ts"]) },
  { name: "migrate", why: "the local database gets its schema before anything seeds it", go: () => sh(["bun", "scripts/db.ts", "migrate-local"]) },
  { name: "browsers", why: "webkit for the render tier; a no-op once installed", go: () => sh(["bun", "x", "playwright", "install", "webkit"]) },
  { name: "fixtures", why: "seed.sql regenerated from the model, after the schema it targets exists", go: () => sh(["bun", "scripts/build/8-seed.ts"]) },
]

/** What any command needs to BUILD. check and deploy stop here. */
export function prepare(): void {
  for (const step of BUILD) step.go()
}

/** prepare, plus what only a local run needs. dev and the e2e tier need this. */
export function local(): void {
  prepare()
  for (const step of LOCAL) step.go()
}

/** `bun scripts/prepare.ts --order` prints what runs, in order, and why. */
if (import.meta.main && process.argv.includes("--order")) {
  for (const [label, steps] of [["prepare", BUILD], ["local (adds)", LOCAL]] as const) {
    console.log(`\n${label}`)
    for (const s of steps) console.log(`  ${s.name.padEnd(10)} ${s.why}`)
  }
  console.log("")
  process.exit(0)
}

if (import.meta.main) {
  const mode = process.argv[2]
  if (mode === "local") local()
  else prepare()
}
