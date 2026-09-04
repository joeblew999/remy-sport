/**
 * Source files are text, so their diffs can be read.
 *
 * `tests/worker/authz-equivalence.test.ts` builds a cache key by joining values
 * with a separator that cannot appear in any of them:
 *
 *     const key = `${relation}\0${viewer.id}\0${viewer.role ?? ""}\0${objectId ?? ""}`
 *
 * The technique is right. Writing the raw byte instead of the escape is not:
 * git sees a NUL, decides the file is binary, and prints `Bin 8905 -> 8914
 * bytes` where a diff should be. **Nobody can review a change to that file.**
 *
 * That is not a tidiness complaint. On 2026-09-04 nine bytes of one agent's
 * in-flight edit were swept into another agent's commit by a broad `git add`,
 * and the reason nobody saw it in the diff is that there was no diff to see.
 * AGENTS.md already tells you to read `git status` before a broad add — this is
 * the half of that rule a machine can keep.
 *
 * `\0` in a template literal is the same byte at runtime and leaves the file
 * readable, so the fix costs nothing and there is no case for an exemption.
 *
 * ## Why not .gitattributes
 *
 * Marking the file `diff` would make git render it, and would leave the next
 * file to grow a NUL silently binary again. This fails at the point the byte
 * arrives, which is where somebody can still choose the escape.
 */

import { readdirSync, readFileSync } from "fs"
import { join, resolve } from "path"

const ROOT = resolve(import.meta.dir, "../..")

/** The trees a person authors. Generated and vendored output is not our text. */
const AUTHORED = ["src", "tests", "scripts", "messages"]

const SKIP = new Set(["node_modules", "dist", "paraglide", ".wrangler"])

const files: string[] = []
const walk = (dir: string) => {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walk(path)
    else if (/\.(ts|tsx|js|mjs|cjs|json|css|sql|md|toml)$/.test(entry.name)) files.push(path)
  }
}
for (const dir of AUTHORED) walk(dir)

const problems: string[] = []

for (const file of files) {
  const bytes = readFileSync(join(ROOT, file))
  const at = bytes.indexOf(0)
  if (at === -1) continue
  const line = bytes.subarray(0, at).toString("utf-8").split("\n").length
  const total = bytes.filter((b) => b === 0).length
  problems.push(
    `  ${file}:${line}  ${total} NUL byte(s)\n` +
      "      git treats this file as binary, so its diffs cannot be reviewed.\n" +
      "      Write \\0 in the string literal instead — same byte at runtime, readable file.",
  )
}

if (problems.length) {
  console.error(`\ncheck-text: ${problems.length} source file(s) git will treat as binary\n`)
  for (const p of problems) console.error(p)
  console.error("")
  process.exit(1)
}

console.log(`check-text: ${files.length} authored file(s), all of them text`)
