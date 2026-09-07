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
 *   prepare()  what any command needs to BUILD — deps, worker types.
 *              deploy needs this and nothing more.
 *   local()    prepare plus what only a local run needs — .dev.vars, local
 *              migrations, browsers, fixtures. `bun run setup` is this, once.
 *
 * Everything here is idempotent and quiet when there is nothing to do, because
 * it runs at the head of every command.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "fs"
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

/** `bun x @playwright/mcp@<pin> install-browser <browser>`, both read from the MCP's own config. */
function mcpBrowserInstall(): string[] {
  const { mcpServers } = JSON.parse(readFileSync(".mcp.json", "utf8")) as {
    mcpServers: { playwright: { args: string[] } }
  }
  const pkg = mcpServers.playwright.args.find((a) => a.startsWith("@playwright/mcp@"))
  if (!pkg) throw new Error(".mcp.json: the playwright server's args carry no @playwright/mcp@<version> pin")
  const { browser } = JSON.parse(readFileSync("playwright-mcp.json", "utf8")) as {
    browser: { browserName: string }
  }
  return ["bun", "x", pkg, "install-browser", browser.browserName]
}

const INSTALL: Step = {
  name: "install",
  why: "everything below is a node_modules binary",
  go: bunInstall,
}

const BUILD: Step[] = [
  INSTALL,
  { name: "i18n", why: "generate the message modules before typechecking a fresh checkout", go: () => sh(["bun", "scripts/lib/i18n.ts"]) },
  { name: "types", why: "generate stable binding types independently of local credentials", go: () => sh(["bun", "x", "wrangler", "types", "--env-file", "scripts/lib/types.env"]) },
]

/**
 * No bundle step. `bun run check` builds before it tests and `deploy` builds
 * for its environment; development builds nothing — Vite serves the Worker
 * and the SPA from source. The step that lived here deferred to a watcher, and
 * the watcher was the race behind a day of stale bundles.
 */

const LOCAL: Step[] = [
  { name: "dev-vars", why: ".dev.vars before anything runs the Worker, including the tests", go: () => sh(["bun", "scripts/lib/dev-vars.ts"]) },
  { name: "migrate-local", why: "the local database gets its schema before anything seeds it", go: () => sh(["bun", "scripts/db.ts", "migrate-local"]) },
  { name: "browsers", why: "webkit for the render tier; a no-op once installed", go: () => sh(["bun", "x", "playwright", "install", "webkit"]) },
  /**
   * The Playwright MCP is its own Playwright build and wants its own browser
   * under the same PLAYWRIGHT_BROWSERS_PATH — the repo's webkit-2336 is not
   * its webkit-2342, and an agent's first `browser_navigate` of a session
   * failed on exactly that, which is the whole real-time half of looking at
   * the app gone. The package pin is read off .mcp.json and the browser off
   * playwright-mcp.json, so what gets installed is what the MCP will ask for
   * and bumping either file is the only edit.
   */
  { name: "mcp-browser", why: "the Playwright MCP's own webkit, so an agent can drive the app live; a no-op once installed", go: () => sh(mcpBrowserInstall()) },
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
  /**
   * Say what is being done, while it is being done.
   *
   * This ran in complete silence unless it failed, and it is the most opaque
   * thing in the repo: it happens before EVERY command, and it installs
   * dependencies, generates the Worker types, writes .dev.vars, migrates the
   * local database and installs a browser. None of that was visible, so
   * `bun run dev` looked like it started a server and nothing else.
   *
   * The cost of the silence was not curiosity. When the versions step broke, the
   * only output was one line about a missing environment variable, from a script
   * nobody had asked to run, before a dev server that then did not start.
   *
   * One line, dim, naming each step as it goes. `--verbose` is not the answer:
   * the default should not hide what the command actually does.
   */
  const pad = Math.max(...steps.map((s) => s.name.length))
  for (const step of steps) {
    const started = Date.now()
    const code = step.go()
    if (code === 0) {
      const took = Date.now() - started
      // Fast means it decided there was nothing to do, which is worth seeing:
      // it is the difference between "built the bundle" and "the bundle was
      // already current", and those look identical in silence.
      const note = took < 150 ? "up to date" : `${(took / 1000).toFixed(1)}s`
      console.log(`\x1b[2mprepare · ${step.name.padEnd(pad)}  ${note}\x1b[0m`)
      continue
    }
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

/** prepare, plus what only a local run needs — `bun run setup`. */
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
