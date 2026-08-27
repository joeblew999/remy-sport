import { defineConfig } from "drizzle-kit"

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
})
