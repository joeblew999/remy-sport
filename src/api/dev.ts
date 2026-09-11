/**
 * The endpoints that exist only where the policy table allows them.
 *
 * One file rather than four Hono routers, and one gate rather than a
 * `permits()` line remembered per route — `dev(capability)` in ./base.ts does
 * it, and the authz walk prints every one of them. Which capability gates
 * which endpoint is unchanged from the routers these replace.
 *
 * Their URLs are unchanged too, so `bun run ops`, the Playwright suites and
 * anything else calling them by path keep working; what changes is that they
 * are now in the published document and the typed client.
 */

import { sql } from "drizzle-orm"
import { z } from "zod"
import { SEED_STATEMENTS } from "../db/seed"
import * as schema from "../db/schema"
import { dev } from "./base"

/**
 * Seed the database with the Product Owner's model.
 *
 * Executes the statements src/db/seed.ts derives from the model, in one batch
 * so D1 wraps it in a transaction and a foreign key unsatisfied mid-file
 * cannot leave the database half-seeded. `INSERT OR IGNORE` throughout, so
 * re-seeding neither duplicates rows nor clobbers edited ones.
 *
 * No admin session is required: seeding the first admin cannot itself need an
 * admin. What keeps it safe is that it does not exist on production —
 * `bun run db seed-remote` applies the same statements through wrangler, so no
 * HTTP surface is needed there. Until 2026-08-28 it was open on a public
 * domain, where anyone could spend 330 D1 statements per call.
 */
export const seed = dev("seedRoute")
  .route({ method: "POST", path: "/seed", summary: "Seed the database from the model" })
  .output(z.object({ statements: z.number(), written: z.number() }))
  .handler(async ({ context }) => {
    const results = await context.env.DB.batch(
      SEED_STATEMENTS.map((statement) => context.env.DB.prepare(statement)),
    )
    return {
      statements: SEED_STATEMENTS.length,
      written: results.reduce((n: number, r: D1Result) => n + (r.meta?.changes ?? 0), 0),
    }
  })

/**
 * Prune accumulated sessions (ADR 014).
 *
 * Every sign-in creates a session row and nothing removed them, so a local
 * database reached 990 — 314 for one seeded actor. Not merely untidy:
 * `list-sessions` returns a bounded set, so past roughly a hundred rows the
 * *newest* session stops being returned and the devices page can no longer
 * identify which one you are using.
 *
 * Production must not have it — a bulk session delete is a denial-of-service
 * primitive, and real sessions expire on their own.
 */
export const pruneSessions = dev("devSessionRoutes")
  .route({ method: "POST", path: "/dev/prune-sessions", summary: "Prune old sessions" })
  .output(z.object({ before: z.number(), after: z.number() }))
  .handler(async ({ context }) => {
    const count = async () =>
      (await context.db.select({ n: sql<number>`count(*)` }).from(schema.session).get())?.n ?? 0
    const before = await count()

    // Keep the five most recent per user rather than wiping everything: the
    // devices page is only worth testing when there is more than one session,
    // and a suite that always starts from exactly one would not exercise
    // revoke.
    await context.db.run(sql`
      DELETE FROM session
      WHERE id NOT IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
          FROM session
        ) WHERE rn <= 5
      )
    `)

    return { before, after: await count() }
  })
