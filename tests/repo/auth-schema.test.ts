import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, it } from "vitest"

/**
 * Better Auth owns its tables, and the committed copy must be what it generates.
 *
 * The library decides what columns its tables have; a hand-edited copy drifts
 * silently, and the drift only shows as a query against a column that is not
 * there — migration 0007 broke every sign-in that way. This was a step of the
 * deploy pipeline; it is a question about the tree, so it is asked with the
 * rest of them, on every `bun run check`.
 *
 * Generated into a temporary directory and compared, rather than generated
 * over the committed file and checked with git: a check that mutates what it
 * is checking cannot be run on a dirty tree without destroying the answer.
 * `bun run ops auth-schema` is the command that regenerates in place.
 */
it(
  "src/db/auth-schema.ts is what Better Auth generates from auth.config",
  () => {
    const dir = mkdtempSync(join(tmpdir(), "auth-schema-"))
    try {
      const fresh = join(dir, "auth-schema.ts")
      const generated = spawnSync(
        "bun",
        ["x", "auth", "generate", "--config", "src/auth.cli.ts", "--output", fresh, "-y"],
        { encoding: "utf8" },
      )
      expect(generated.status, `auth generate failed:\n${generated.stderr}`).toBe(0)
      const committed = existsSync("src/db/auth-schema.ts") ? readFileSync("src/db/auth-schema.ts", "utf8") : ""
      expect(
        readFileSync(fresh, "utf8") === committed,
        "src/db/auth-schema.ts is stale — run 'bun run ops auth-schema' and commit the result",
      ).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  },
  60_000,
)
