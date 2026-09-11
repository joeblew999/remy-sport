import { readFileSync } from "node:fs"
import { rule } from "./helpers"
import { ROOT, sources } from "./lib/ast"

/**
 * No comment block may be longer than the code it explains deserves.
 *
 * A third of this repo is comments, and the volume is concentrated: most blocks
 * are a few lines and earn them, while a couple of hundred run to essays —
 * incident histories, dated measurements, transcripts of console output. Those
 * are a second copy of the git log, written where nothing can verify it.
 *
 * A ratchet rather than a flat limit, because the limit cannot be met today and
 * a rule that fails on arrival gets deleted. The count may only go down. Lower
 * BUDGET whenever it does — the test names the number to write.
 */

const LIMIT = 20

/**
 * The most oversized blocks allowed. Only ever reduce it.
 *
 * 188 when this was written, over 3,518 blocks in total.
 */
const BUDGET = 129

const oversized: string[] = []

for (const path of [...sources("src"), ...sources("scripts"), ...sources("tests")]) {
  // Copied verbatim from ../remy-sport-biz; not ours to edit.
  if (path.startsWith("src/domain/model/")) continue

  const lines = readFileSync(`${ROOT}/${path}`, "utf8").split("\n")
  let start = -1
  lines.forEach((line, i) => {
    const isComment = /^\s*(\*|\/\/|\/\*)/.test(line)
    if (isComment && start < 0) start = i
    if (!isComment && start >= 0) {
      if (i - start > LIMIT) oversized.push(`${path}:${start + 1}  ${i - start} lines`)
      start = -1
    }
  })
}

rule(
  `no more than ${BUDGET} comment blocks run past ${LIMIT} lines`,
  oversized.length > BUDGET ? oversized.slice(0, 20) : [],
  `comment-length: ${oversized.length} blocks over ${LIMIT} lines, budget is ${BUDGET}.\n` +
    `  Shorten one, or explain why the block earns its length.\n\n` +
    oversized
      .slice(0, 20)
      .map((o) => `  ✗ ${o}`)
      .join("\n"),
  oversized.length < BUDGET
    ? `comment-length: ${oversized.length} oversized blocks — below the budget of ${BUDGET}. ` +
      `Set BUDGET to ${oversized.length} in tests/repo/comment-length.test.ts.`
    : `comment-length: ${oversized.length} blocks over ${LIMIT} lines, at budget`,
)
