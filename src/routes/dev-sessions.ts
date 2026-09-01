import { Hono } from "hono"
import { drizzle } from "drizzle-orm/d1"
import { sql } from "drizzle-orm"
import type { AppEnv } from "../types"
import * as schema from "../db/schema"
import { permits } from "../environment"

/**
 * Prune accumulated sessions. Local development and tests only (ADR 014).
 *
 * Every sign-in creates a session row and nothing removed them, so a local
 * database reached 990 — 314 for one seeded actor. That is not merely untidy:
 * `list-sessions` returns a bounded set, so past roughly a hundred rows the
 * *newest* session stops being returned, and the devices page could no longer
 * identify which one you were using. Exactly the failure the organization list
 * hit for the same reason.
 *
 * Production does not need this — real sessions expire and Better Auth clears
 * them — and must not have it, since an endpoint that deletes sessions in bulk
 * is a denial-of-service primitive. Gated on the same dev-transport check as
 * /api/dev/outbox.
 */

const devSessions = new Hono<AppEnv>()

devSessions.post("/api/dev/prune-sessions", async (c) => {
  if (!permits(c.env, "devSessionRoutes")) return c.notFound()

  const db = drizzle(c.env.DB, { schema })
  const before = await db.select({ n: sql<number>`count(*)` }).from(schema.session).get()

  // Keep the five most recent per user rather than wiping everything: the
  // devices page is only worth testing when there is more than one session, and
  // a suite that always starts from exactly one would not exercise revoke.
  await db.run(sql`
    DELETE FROM session
    WHERE id NOT IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
        FROM session
      ) WHERE rn <= 5
    )
  `)

  const after = await db.select({ n: sql<number>`count(*)` }).from(schema.session).get()
  return c.json({ before: before?.n ?? 0, after: after?.n ?? 0 })
})

export default devSessions
