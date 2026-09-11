import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

/**
 * Typecheck what is COMMITTED, not what is in the working tree.
 *
 * The two are different whenever a commit is partial, and a partial commit is
 * not a hypothetical here: on 2026-09-11 a `git add` naming a path `git rm`
 * had already staged aborted without adding anything, and the commit that
 * followed contained only the deletion of a router `src/index.ts` still
 * imported. Every check was green, because every check ran against a working
 * tree that was correct.
 *
 * `git archive HEAD` is the same instrument `tests/unit/remote-cli.test.ts`
 * uses and for the same reason: committed content is immutable, and several
 * agents work in this tree at once, so "it passes here" says nothing about
 * what was pushed.
 *
 * Typecheck only. It needs no install, which is what keeps it fast enough to
 * run before every push — `node_modules` and `tsconfig` paths are symlinked in
 * from the real checkout rather than resolved again.
 */

const ROOT = process.cwd()

/** Which commit to check. HEAD unless a ref is named — `ops committed ac36d53`. */
const REF = process.argv[2] ?? "HEAD"

/**
 * The checkout's own tsc, invoked directly rather than through `bun x`.
 *
 * The extracted tree carries mise.toml, and anything run with its directory as
 * cwd trips mise's trust prompt on a temporary path. tsc resolves `include`
 * and `paths` relative to the tsconfig it is given, so pointing `-p` at the
 * extracted config needs no cwd change and no trust.
 */
function typecheckAt(dir: string): { ok: boolean; out: string } {
  const p = spawnSync(join(ROOT, "node_modules/.bin/tsc"), ["--noEmit", "-p", join(dir, "tsconfig.json")], {
    encoding: "utf8",
  })
  return { ok: p.status === 0, out: `${p.stdout ?? ""}${p.stderr ?? ""}` }
}

const dir = mkdtempSync(join(tmpdir(), "remy-committed-"))
try {
  const archive = spawnSync("sh", ["-c", `git archive ${REF} | tar -x -C ${JSON.stringify(dir)}`], {
    cwd: ROOT,
    encoding: "utf8",
  })
  if (archive.status !== 0) throw new Error(`git archive failed: ${archive.stderr}`)

  /**
   * Dependencies and generated trees come from the checkout; only the sources
   * come from HEAD.
   *
   * `src/paraglide` is compiled from the message files and is gitignored, so
   * `git archive` rightly omits it — and without it every module importing a
   * message fails to resolve, which would make this report a hundred errors
   * that say nothing about the commit. Linking it is the same decision as
   * linking node_modules: this check is about what was committed, not about
   * whether a fresh clone can build from scratch.
   */
  for (const generated of ["node_modules", "src/paraglide", "src/web/paraglide"]) {
    const from = join(ROOT, generated)
    if (!existsSync(from)) continue
    mkdirSync(dirname(join(dir, generated)), { recursive: true })
    spawnSync("ln", ["-s", from, join(dir, generated)])
  }

  const { ok, out } = typecheckAt(dir)
  if (!ok) {
    console.error(`committed: ${REF} does not typecheck.\n`)
    console.error(out.trim())
    console.error(
      "\nThe working tree may still be correct — that is the point. Something the\n" +
        "commit needs was left out of it. `git diff --cached --name-only` before\n" +
        "committing shows what actually went in.",
    )
    process.exit(1)
  }
  console.log(`committed: ${REF} typechecks`)
} finally {
  rmSync(dir, { recursive: true, force: true })
}
