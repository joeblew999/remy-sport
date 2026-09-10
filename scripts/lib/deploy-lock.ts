/**
 * One deploy at a time, and nothing else touching the tree while it runs.
 *
 * A deploy builds into `dist/`, drives a dev server on a fixed port, writes
 * `test-results/`, and checks the working tree against what it published. Every
 * one of those is shared, so anything else that builds or tests *during* a
 * deploy corrupts it — and the deploy reports a failure it does not have, which
 * is the one thing a gate must never do.
 *
 * On 2026-09-10 that happened four times in one session, each in a different
 * way and each looking like a different bug:
 *
 *   · editing `playwright.config.ts` mid-run — the version guard refused,
 *     printing two identical commits and advising a checkout already done
 *   · an untracked screenshot at the repository root — same guard, same refusal
 *   · running `test:render` while staging verified — both tiers defaulted to
 *     `test-results/`, Playwright empties it on start, and the deploy's traces
 *     vanished underneath it: `ENOENT … recording9.network`
 *   · editing `vite.config.ts` mid-verification — the guard again
 *
 * Each was fixed where it showed up: a guard that names the file, a root-level
 * exemption, one output directory per tier. None of them stopped the *next*
 * one, because the class was never addressed — nothing made a second process
 * aware that a deploy was in progress. This does.
 *
 * Advisory, deliberately: it refuses commands that write shared state, and says
 * what holds it and since when. It cannot stop an editor saving a file, so it
 * is not a substitute for the version guard — it is the thing that stops the
 * version guard from being the first time anybody finds out.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "../..")
const LOCK = resolve(ROOT, ".playwright/deploy.lock")

interface Held {
  pid: number
  environment: string
  since: string
}

function read(): Held | null {
  if (!existsSync(LOCK)) return null
  try {
    return JSON.parse(readFileSync(LOCK, "utf8")) as Held
  } catch {
    // A truncated lock is not a held one. Better to let work through than to
    // wedge the repository on a half-written file.
    return null
  }
}

/**
 * Is the process that took this lock still alive?
 *
 * A deploy killed with ^C, or a machine restarted mid-run, would otherwise
 * leave a lock nobody can release — and a guard that has to be deleted by hand
 * is a guard people learn to delete rather than read. `kill(pid, 0)` sends no
 * signal; it only asks whether the process exists.
 */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** Take the lock for the length of this process. Released on any exit. */
export function holdDeployLock(environment: string): void {
  const held = read()
  if (held && alive(held.pid)) {
    console.error(
      `\ndeploy: another deploy is already running.\n\n` +
        `  ${held.environment}, pid ${held.pid}, since ${held.since}\n\n` +
        `  Two deploys share dist/, the local ports and the database they seed.\n` +
        `  Wait for it, or stop it with: kill ${held.pid}\n`,
    )
    process.exit(1)
  }

  mkdirSync(dirname(LOCK), { recursive: true })
  writeFileSync(LOCK, JSON.stringify({ pid: process.pid, environment, since: new Date().toISOString() }))
  /**
   * The deploy runs `check`, `test:e2e` and a build as child processes, and
   * every one of them consults this lock. They inherit the environment, so a
   * child can tell "a deploy is running" from "*my* deploy is running" —
   * without it the deploy would refuse itself at its own first step.
   */
  process.env.REMY_DEPLOYING = String(process.pid)

  const release = () => {
    // Only if it is still ours: a lock taken by a later deploy must survive
    // this one's exit handlers.
    const current = read()
    if (current?.pid === process.pid) rmSync(LOCK, { force: true })
  }
  process.on("exit", release)
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.on(signal, () => {
      release()
      process.exit(130)
    })
  }
}

/**
 * Refuse to run something that writes what a deploy is reading.
 *
 * Called by the commands that touch `dist/`, `test-results/` or the local
 * ports. It says what is running and what to do, because "refused" without a
 * reason is how a guard becomes something people work around.
 */
export function refuseWhileDeploying(what: string): void {
  const held = read()
  if (!held || !alive(held.pid)) return
  // Our own deploy, several processes down. Its steps are the point.
  if (process.env.REMY_DEPLOYING === String(held.pid)) return

  console.error(
    `\n${what}: a deploy is running — ${held.environment}, pid ${held.pid}, since ${held.since}.\n\n` +
      `  It is building into dist/, driving the local ports, writing test-results/\n` +
      `  and comparing this working tree against what it published. Running now\n` +
      `  corrupts it, and the failure it reports will not be its own.\n\n` +
      `  Wait for it to finish, or stop it with: kill ${held.pid}\n\n` +
      `  This has cost four deploys. scripts/lib/deploy-lock.ts.\n`,
  )
  process.exit(1)
}
