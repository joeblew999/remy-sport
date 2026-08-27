import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { defineConfig } from "drizzle-kit"

/**
 * Where miniflare keeps the local D1 database.
 *
 * The filename is a hash wrangler derives, not something this project chooses,
 * and `mise run cf:d1:reset` deletes the directory outright — so it is found at
 * load time rather than written down. `metadata.sqlite` is wrangler's own
 * bookkeeping and is not the database.
 */
const D1_STATE_DIR = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject"

function localD1(): string | undefined {
  if (!existsSync(D1_STATE_DIR)) return undefined
  const file = readdirSync(D1_STATE_DIR).find(
    (f) => f.endsWith(".sqlite") && f !== "metadata.sqlite",
  )
  return file ? join(D1_STATE_DIR, file) : undefined
}

/**
 * `generate` diffs the schema against the snapshot and never opens a database,
 * so it must keep working on a checkout that has never run wrangler. `studio`
 * is the only command here that needs a connection, which is why dbCredentials
 * is present only when there is something to connect to — an empty url fails
 * config validation for *every* command, `generate` included.
 */
const url = localD1()

/**
 * drizzle-kit generates the schema migrations; the fixtures generate the rows.
 *
 * Migrations 0001-0017 were written by hand or emitted whole by
 * scripts/domain-generate.ts, and that second arrangement had a hard limit: the
 * generator always emitted *current state*, so regenerating rewrote migrations
 * deployed databases had already applied. Additive change survived that; a
 * rename did not, which is why `relationships.jsonl` still carries a name
 * nobody likes.
 *
 * drizzle-kit diffs the schema against a stored snapshot and emits only what
 * changed, which is the missing capability. `meta/0000_snapshot.json` is a
 * baseline for what migrations 0001-0017 already built — there is no
 * corresponding 0000 SQL file, deliberately, because that work is done.
 *
 * `out` is the wrangler migrations directory, so a generated delta is applied by
 * `mise run cf:d1:migrations:apply` like any other. wrangler reads the numbered
 * .sql files and ignores meta/.
 */
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  ...(url ? { dbCredentials: { url } } : {}),
})
