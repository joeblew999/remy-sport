import { env } from "cloudflare:test"
import { SEED_STATEMENTS } from "../../src/db/seed"

/**
 * Give every test file a migrated database, in one batch.
 *
 * `applyD1Migrations` walks the migrations one at a time and maintains the
 * `d1_migrations` bookkeeping table. None of that is needed: `isolatedStorage`
 * throws the database away after each file, so nothing migrates twice. The
 * statements arrive pre-split from `readD1Migrations` in vitest.config.ts,
 * which reads the real `src/db/migrations` — so a migration that breaks the app
 * breaks these tests too. `batch` is one implicit transaction, so a broken
 * migration fails the file loudly rather than leaving half a schema.
 *
 * ## Two measurements, so they are not re-derived
 *
 * **The SQL is not the cost.** An empty setup is 10ms; one that runs a single
 * `SELECT 1` is 4.00s; one that runs all 840 statements is 4.15s. The cost is
 * the first touch of `env.DB` — Miniflare standing up D1 for this file — paid
 * by whatever query is first. So building the database once and restoring a
 * snapshot per file would remove ~4% and still pay the rest, because restoring
 * is itself a query.
 *
 * **The tier is bounded by its slowest file, not the sum.** Files run in
 * parallel, so removing one buys nothing above the ~5s floor; splitting the
 * largest took the tier from 24.5s to 16.2s.
 *
 * Past that floor means `isolatedStorage: false`, which trades a real guarantee
 * — specs cannot race or see each other's writes — for a few seconds.
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
