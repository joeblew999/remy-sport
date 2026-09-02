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

import { existsSync, readdirSync, statSync } from "fs"
import { join } from "path"

/**
 * Quiet on success, and on failure everything the command said.
 *
 * A quiet step used to `ignore` stdout, which DISCARDS it — so a command that
 * explained itself on stdout and exited non-zero produced an abort with no
 * reason attached. That was survivable while `runSteps` dropped exit codes and
 * nothing stopped; now that a failure is fatal, silence is the worst thing it
 * could do. Both streams are buffered and replayed together, to stderr, so the
 * order the command wrote them in is the order you read them in.
 */
function sh(argv: string[], quiet = true): number {
  const proc = Bun.spawnSync(argv, {
    stdout: quiet ? "pipe" : "inherit",
    stderr: quiet ? "pipe" : "inherit",
  })
  if (proc.exitCode !== 0 && quiet) {
    process.stderr.write(proc.stdout?.toString() ?? "")
    process.stderr.write(proc.stderr?.toString() ?? "")
  }
  return proc.exitCode ?? 1
}

/** Newer than every input, so nothing needs doing. */
function fresh(output: string, inputs: string[]): boolean {
  if (!existsSync(output)) return false
  const out = statSync(output).mtimeMs
  // Newest file anywhere beneath each input: a directory's own mtime does not
  // move when a file two levels down is edited, so comparing that would call a
  // stale bundle fresh.
  const newest = (p: string): number => {
    const st = statSync(p)
    if (!st.isDirectory()) return st.mtimeMs
    return readdirSync(p).reduce((max, e) => Math.max(max, newest(join(p, e))), st.mtimeMs)
  }
  return inputs.every((i) => !existsSync(i) || newest(i) <= out)
}

function bunInstall(): number {
  if (fresh("node_modules/.bin", ["bun.lock", "package.json"])) return 0
  return sh(["bun", "install"], false)
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
function webBuild(): number {
  const watching = Bun.spawnSync(
    ["pgrep", "-f", "vite build --config src/web/vite.config.ts --watch"],
    { stdout: "pipe", stderr: "ignore" },
  )
  if (watching.stdout.toString().trim() && existsSync("dist/web/index.html")) return 0

  /**
   * Skip when the bundle is already newer than everything it is built from.
   *
   * The mise task this replaced declared `sources` and `outputs`, so the runner
   * skipped it when nothing had changed. Moving it here lost that, and every
   * command rebuilt unconditionally — a deploy did it three times, once for
   * itself and again inside check and the e2e tier.
   *
   * That is not merely wasted seconds. `vite build` EMPTIES dist/web before it
   * writes, so each redundant rebuild opens a window in which the directory is
   * empty, and anything reading it then sees nothing. A production deploy failed
   * at the gate on exactly that: assets.test.ts got 404 for `/` because the
   * Worker's [assets] binding found an empty directory.
   *
   * `sources` lists what the build READS, not what lives in its own folder —
   * src/paraglide and src/domain are in it because the SPA imports both, and
   * leaving them out once shipped a bundle without a newly added message.
   */
  const sources = ["src/web", "src/paraglide", "src/domain", "messages", "package.json", "bun.lock"]
  if (fresh("dist/web/index.html", sources)) return 0

  return sh(["bun", "x", "vite", "build", "--config", "src/web/vite.config.ts", "--logLevel", "warn"], false)
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
  /** Exit code. 0 is success — see `runSteps`, which is the only caller. */
  go: () => number
}

const INSTALL: Step = {
  name: "install",
  why: "everything below is a node_modules binary",
  go: bunInstall,
}

const BUILD: Step[] = [
  INSTALL,
  {
    name: "fonts",
    why: "writes src/web/fonts.css, which styles.css imports on its first line — so it precedes the bundle that reads it",
    go: () => sh(["bun", "scripts/lib/fonts.ts"]),
  },
  { name: "bundle", why: "dist/web is gitignored and the [assets] binding points at it, so a fresh clone has none", go: webBuild },
  { name: "types", why: "worker-configuration.d.ts is generated from the bindings, and the typecheck reads it", go: () => sh(["bun", "x", "wrangler", "types"]) },
]

const LOCAL: Step[] = [
  { name: "dev-vars", why: ".dev.vars before anything runs the Worker, including the tests", go: () => sh(["bun", "scripts/lib/dev-vars.ts"]) },
  { name: "migrate-local", why: "the local database gets its schema before anything seeds it", go: () => sh(["bun", "scripts/db.ts", "migrate-local"]) },
  { name: "browsers", why: "webkit for the render tier; a no-op once installed", go: () => sh(["bun", "x", "playwright", "install", "webkit"]) },
  { name: "seed", why: "seed.sql regenerated from the model, after the schema it targets exists", go: () => sh(["bun", "scripts/lib/seed.ts"]) },
]

/**
 * Run them in order, and stop dead on the first one that fails.
 *
 * This used to be `for (const step of BUILD) step.go()`, discarding every exit
 * code — and `sh` only *prints* a failure, so nothing anywhere observed one. On
 * 2026-09-02 `fonts.ts` stopped parsing altogether: `bun` exited 1 with a
 * SyntaxError, the code was dropped here, and the run continued to build a
 * bundle against a stylesheet that no longer regenerated. It reported success,
 * and `2-check` went green over it.
 *
 * A prerequisite that fails silently is worse than no prerequisite, because the
 * command now claims work it did not do. The step's own `why` is the message:
 * it already says what the rest of the run was depending on.
 */
function runSteps(steps: Step[]): void {
  for (const step of steps) {
    const code = step.go()
    if (code === 0) continue
    console.error(
      `\nprepare: "${step.name}" failed (exit ${code}) — ${step.why}\n` +
        `Nothing after it ran, so the tree is half-prepared; fix this before reading any later failure.\n`,
    )
    process.exit(1)
  }
}

/** Dependencies only — what `ops` and `db` need, since neither builds anything. */
export function install(): void {
  runSteps([INSTALL])
}

/** What any command needs to BUILD. check and deploy stop here. */
export function prepare(): void {
  runSteps(BUILD)
}

/** prepare, plus what only a local run needs. dev and the e2e tier need this. */
export function local(): void {
  runSteps([...BUILD, ...LOCAL])
}

/** `bun scripts/lib/prepare.ts --help` prints what runs, in order, and why. */
if (import.meta.main && process.argv.includes("--help")) {
  for (const [label, steps] of [["prepare", BUILD], ["local (adds)", LOCAL]] as const) {
    console.log(`\n${label}`)
    const pad = Math.max(...steps.map((x) => x.name.length))
    for (const s of steps) console.log(`  ${s.name.padEnd(pad)}  ${s.why}`)
  }
  console.log("")
  process.exit(0)
}

if (import.meta.main) {
  const mode = process.argv[2]
  if (mode === "local") local()
  else prepare()
}
