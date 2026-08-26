import { applyD1Migrations, env } from "cloudflare:test"

/**
 * Give every test file a migrated database.
 *
 * `isolatedStorage` hands each file its own empty D1; this runs the real
 * migrations into it before any test does. The migrations come from
 * `src/db/migrations` via vitest.config.ts, so a migration that breaks the app
 * breaks these tests rather than passing against a hand-kept fixture schema.
 */
await applyD1Migrations(env.DB, (env as unknown as { TEST_MIGRATIONS: never }).TEST_MIGRATIONS)
