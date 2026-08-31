import { env } from "cloudflare:test"
import { SEED_STATEMENTS } from "../../src/db/seed"

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
 * What is left is not SQL. A worker test file costs ~5s of workerd and
 * Miniflare startup before a single assertion runs.
 *
 * ## "Six files is ~18s of that, and the only lever is having fewer files"
 *
 * That is what this said, and it is wrong. Vitest runs test files in *parallel*,
 * so the startup cost is paid concurrently and the tier's wall clock is its
 * slowest file, not the sum of them.
 *
 * The difference is not academic — it points at the opposite fix. Acting on the
 * serial reading on 2026-08-31, I merged authz-equivalence.test.ts into
 * relations.test.ts to remove a file, measured, and the tier did not move by a
 * tenth of a second. It was 24.5s because write.test.ts had grown to 2279 lines
 * and 21.5s on its own, while every other file finished in about five.
 * Splitting it in two took the tier to 16.2s.
 *
 * So the lever is a smaller *biggest* file. Fewer files buys nothing above the
 * ~5s floor, and merging two small ones makes the tier slower to no purpose.
 */
const migrations = (env as unknown as { TEST_MIGRATIONS: { queries: string[] }[] }).TEST_MIGRATIONS

await env.DB.batch(
  migrations
    .flatMap((m) => m.queries)
    .map((q) => q.trim())
    .filter(Boolean)
    .map((q) => env.DB.prepare(q)),
)

/**
 * And the seed, in the same batch style.
 *
 * `beforeAll(seed)` in each spec used to POST /api/seed — a full Better Auth
 * `createUser` round trip per user, through the Worker, into the same database
 * every other spec was using. Here it is a batch of INSERTs into this file's own
 * storage.
 *
 * The same `SEED_STATEMENTS` /api/seed executes, imported rather than passed in
 * as a binding: one source, so a test cannot pass against a seed the Worker
 * would not produce.
 */
await env.DB.batch(SEED_STATEMENTS.map((q) => env.DB.prepare(q)))
