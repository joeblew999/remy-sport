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
 *
 * ## The statements below are not the floor. Measured, 2026-09-01.
 *
 * The obvious next optimisation is to stop replaying 115 migration and 725 seed
 * statements for all twelve files — build the database once and restore a
 * snapshot per file. **It would save almost nothing**, and the measurement is
 * recorded here because the idea is a good one that happens to be wrong:
 *
 *     setup file empty ............................  10ms
 *     setup file does ONE `SELECT 1` .............. 4.00s
 *     setup file does all 840 statements .......... 4.15s
 *
 * The cost is not the SQL. It is the **first touch of `env.DB`** — Miniflare
 * standing up the D1 simulator for this file's isolated storage — and it is paid
 * by whatever query happens to be first. All 840 statements cost about 150ms on
 * top of it, so a snapshot-and-restore scheme would remove 3.6% of the setup and
 * still pay the other 96%, because restoring is itself a query.
 *
 * Nor is that 4s the tier's bound. Twelve files pay ~4s of setup each — 73s in
 * total — while the tier finishes in 13s, because it overlaps almost perfectly.
 * The tier is bounded by its slowest *file*, and lowering a floor that is paid
 * in parallel changes nothing until it exceeds that file.
 *
 * The only way past it is to stop giving each file its own database, which is
 * `isolatedStorage: false` — and that trades a real guarantee (specs cannot race
 * or see each other's writes) for a few seconds. Not worth it.
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
