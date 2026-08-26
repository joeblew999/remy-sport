import { Hono } from "hono"
import { SEED_STATEMENTS } from "../db/seed"
import type { AppEnv } from "../types"

/**
 * Seed the database with the Product Owner's model.
 *
 * This route used to *build* that model: `createUser` per user, then
 * `createOrganization`, `addMember`, and inserts for everything else — with a
 * `biz_id`/`slug` translation layer threaded through it, because Better Auth
 * generates its own ids while the fixtures carry their own. Three hundred lines
 * to produce rows that a generated SQL file already describes.
 *
 * It executes that file now. One definition of what "seeded" means, two callers:
 * the worker tests apply it per test file, and this applies it to a real D1.
 *
 * Going through Better Auth's API bought nothing here. Its value is enforcing
 * *invariants* on user input, and the fixtures are not user input — they are
 * checked upstream by biz's `data:check` and generated. What it cost was a
 * server: seeding could not happen without one, so every e2e spec had to share
 * one database and one set of actors.
 *
 * `INSERT OR IGNORE` throughout, so re-seeding neither duplicates rows nor
 * clobbers edited ones. No admin session is required: seeding the first admin
 * cannot itself need an admin, which is the bootstrap problem the direct
 * server-side call used to sidestep.
 */
const seed = new Hono<AppEnv>()

seed.post("/api/seed", async (c) => {
  // One batch: D1 wraps it in a transaction, so a foreign key that is not yet
  // satisfied mid-file does not leave the database half-seeded.
  const results = await c.env.DB.batch(
    SEED_STATEMENTS.map((sql) => c.env.DB.prepare(sql)),
  )
  const written = results.reduce((n, r) => n + (r.meta?.changes ?? 0), 0)
  return c.json({ statements: SEED_STATEMENTS.length, written })
})

export default seed
