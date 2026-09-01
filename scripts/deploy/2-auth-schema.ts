/**
 * Better Auth owns its tables, and this proves the committed copy still matches.
 *
 *   bun scripts/deploy/2-auth-schema.ts            fail if src/db/auth-schema.ts is stale
 *   bun scripts/deploy/2-auth-schema.ts --write    regenerate it
 *
 * Same shape as check-seed and check:domain — an artifact compared against the
 * source of truth that generates it. The library decides what columns its tables
 * have; a hand-edited copy drifts silently and the drift only shows as a query
 * against a column that is not there, which is how migration 0007 broke every
 * sign-in.
 *
 * Generated into a temporary directory and diffed, rather than generated over
 * the committed file and then checked with git: a check that mutates what it is
 * checking cannot be run on a dirty tree without destroying the answer.
 */

import { mkdtempSync, rmSync, readFileSync, existsSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

const COMMITTED = "src/db/auth-schema.ts"

function generate(into: string): number {
  const proc = Bun.spawnSync(
    ["bun", "x", "auth", "generate", "--config", "src/auth.cli.ts", "--output", into, "-y"],
    { stdout: "ignore", stderr: "pipe" },
  )
  if (proc.exitCode !== 0) process.stderr.write(proc.stderr?.toString() ?? "")
  return proc.exitCode ?? 1
}

if (process.argv.includes("--write")) {
  process.exit(generate(COMMITTED))
}

const dir = mkdtempSync(join(tmpdir(), "auth-schema-"))
try {
  const fresh = join(dir, "auth-schema.ts")
  if (generate(fresh) !== 0) process.exit(1)
  const before = existsSync(COMMITTED) ? readFileSync(COMMITTED, "utf-8") : ""
  if (readFileSync(fresh, "utf-8") !== before) {
    console.error(
      `auth-schema: ${COMMITTED} is stale — run 'bun scripts/deploy/2-auth-schema.ts --write' and commit it`,
    )
    Bun.spawnSync(["diff", fresh, COMMITTED], { stdout: "inherit", stderr: "inherit" })
    process.exit(1)
  }
  console.log("auth-schema: auth-schema.ts is up to date")
} finally {
  rmSync(dir, { recursive: true, force: true })
}
