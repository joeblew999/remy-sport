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

import { existsSync, statSync } from "fs"

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
  const out = statSync(output).mtimeMs
  return inputs.every((i) => !existsSync(i) || statSync(i).mtimeMs <= out)
}

export function install(): void {
  if (fresh("node_modules/.bin", ["bun.lock", "package.json"])) return
  sh(["bun", "install"], false)
}

/**
 * The SPA bundle, deferring to the dev server's watcher when it holds the
 * directory.
 *
 * `dev` runs `vite build --watch` against the same config and output. Start a
 * second builder and whichever empties dist/web second leaves the other's output
 * gone — a window wide enough that a whole e2e suite once failed with "element
 * not found" on eight specs, because the shell was served with no bundle at all.
 * The watcher is authoritative when it exists: it is already rebuilding on every
 * save, so its output is at least as fresh as ours.
 */
function webBuild(): void {
  const watching = Bun.spawnSync(
    ["pgrep", "-f", "vite build --config src/web/vite.config.ts --watch"],
    { stdout: "pipe", stderr: "ignore" },
  )
  if (watching.stdout.toString().trim() && existsSync("dist/web/index.html")) return
  sh(["bun", "x", "vite", "build", "--config", "src/web/vite.config.ts", "--logLevel", "warn"], false)
}

export function prepare(): void {
  install()
  // fonts before the bundle: it writes src/web/fonts.css, which styles.css
  // imports on its first line. They were parallel siblings with no edge, so the
  // build could read the file while writeFileSync had truncated it.
  sh(["bun", "scripts/build/fonts.ts"])
  webBuild()
  sh(["bun", "x", "wrangler", "types"])
}

/** prepare, plus the four things only a local run needs. */
export function local(): void {
  prepare()
  sh(["bun", "scripts/dev/dev-vars.ts"])
  sh(["bun", "scripts/db.ts", "migrate-local"])
  sh(["bun", "x", "playwright", "install", "webkit"])
  sh(["bun", "scripts/build/seed.ts"])
}

if (import.meta.main) {
  const mode = process.argv[2]
  if (mode === "local") local()
  else prepare()
}
