/**
 * The Bun this repository is pinned to, and whether this process is it.
 *
 * `mise.toml` pins Bun, and in a shell where mise's hook has run that is the
 * Bun on PATH. In one where it has not — an editor's terminal, an agent's
 * shell snapshot, a machine whose global mise still names an older Bun — the
 * global one runs instead, and nothing said so. On 2026-09-08 that was 1.3.14
 * against a pin of 1.4.0, and the difference was not cosmetic: under 1.3.14
 * Playwright's request API throws inside its Set-Cookie parser on the first
 * sign-in, so the staging admin preflight hung until it was killed, and the
 * deploy reported "verification did not complete" over a deployment that was
 * fine. Hours, for a version number nothing had compared.
 *
 * Exact, not "at least": the pin is the version the lockfile, the tests and
 * every recorded run were made with, and the point of a pin is that another
 * version is another environment. `mise x -- bun run <command>` runs the
 * pinned one from a shell that has the wrong one on PATH.
 */
import { readFileSync } from "node:fs"

/** The `bun = "<version>"` pin in a mise.toml's [tools] table, or null when it has none. */
export function pinnedBun(miseToml: string): string | null {
  const match = /^\s*bun\s*=\s*"([^"]+)"/m.exec(miseToml)
  return match?.[1] ?? null
}

/** Null when `running` is the pinned Bun; otherwise what to tell the reader. */
export function bunPinProblem(
  miseToml: string,
  running: string = process.versions.bun ?? `no Bun at all (node ${process.versions.node})`,
): string | null {
  const pinned = pinnedBun(miseToml)
  if (!pinned) return 'mise.toml pins no Bun; add `bun = "<version>"` under [tools]'
  if (pinned === running) return null
  return (
    `this is Bun ${running}, and mise.toml pins ${pinned}.\n` +
    "  The lockfile, the tests and every recorded run are the pinned one's; another Bun\n" +
    "  is another environment (1.3.14 hung the staging sign-in inside Playwright).\n" +
    "  Run through mise, which puts the pinned one on PATH:\n" +
    "    mise install && mise x -- bun run <command>\n" +
    "  or open a shell where `mise activate` has run."
  )
}

/**
 * Refuse unless this process is the pinned Bun. An exit code, because it is a
 * prepare step; the message is on stderr so the refusal explains itself.
 */
export function assertPinnedBun(): number {
  const problem = bunPinProblem(readFileSync("mise.toml", "utf8"))
  if (!problem) return 0
  console.error(`\nbun: ${problem}\n`)
  return 1
}
