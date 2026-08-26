import { env } from "cloudflare:test"

/**
 * Give every test file a migrated database, in one batch.
 *
 * `applyD1Migrations` walks the thirteen migrations one at a time and maintains
 * the `d1_migrations` bookkeeping table as it goes. None of that is needed
 * here: `isolatedStorage` throws the database away after each file, so nothing
 * ever migrates a second time. Batching the 163 statements halved setup.
 *
 * The statements arrive pre-split and pre-ordered from `readD1Migrations` in
 * vitest.config.ts, which reads the real `src/db/migrations` — so a migration
 * that breaks the app breaks these tests too, rather than passing against a
 * hand-kept fixture schema.
 *
 * `batch` is one implicit transaction, so a broken migration fails the file
 * loudly instead of leaving a half-built schema behind it.
 *
 * What is left is not SQL. A worker test file costs ~3s of workerd and
 * Miniflare startup before a single assertion runs — measured with a file
 * containing one `expect(1).toBe(1)`. Six files is ~18s of that, and the only
 * lever on it is having fewer files.
 */
const migrations = (env as unknown as { TEST_MIGRATIONS: { queries: string[] }[] }).TEST_MIGRATIONS

await env.DB.batch(
  migrations
    .flatMap((m) => m.queries)
    .map((q) => q.trim())
    .filter(Boolean)
    .map((q) => env.DB.prepare(q)),
)
