import { Hono } from "hono"
import { SEED_STATEMENTS } from "../db/seed"
import type { AppEnv } from "../types"
import { permits } from "../environment"

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
 * clobbers edited ones. No admin *session* is required: seeding the first admin
 * cannot itself need an admin, which is the bootstrap problem the direct
 * server-side call used to sidestep.
 *
 * **It does not exist on a deployment**, gated on the same dev-transport check
 * as `/api/dev/outbox`. Until 2026-08-28 it was open on a public domain: anyone
 * could POST it and spend 330 D1 statements per call, as often as they liked,
 * and the vocabulary rows upsert — so it also re-asserted the PO's labels over
 * any that had been edited. Neither destroys data, which is why it survived
 * review for so long; both are a stranger deciding how our database spends its
 * time.
 *
 * A token was the first fix and the wrong one: `wrangler secret` values cannot
 * be read back, so the pipeline would have had to keep its own copy of a secret
 * the platform already had. Seeding is an operator action and the operator has
 * wrangler — `mise run seed:remote` applies src/db/seed.sql to D1 directly, so
 * production needs no HTTP surface for it whatsoever. The route that stays is
 * for local development and the tests, which is all it was ever for.
 */
const seed = new Hono<AppEnv>()

seed.post("/api/seed", async (c) => {
  if (!permits(c.env, "seedRoute")) return c.notFound()

  // One batch: D1 wraps it in a transaction, so a foreign key that is not yet
  // satisfied mid-file does not leave the database half-seeded.
  const results = await c.env.DB.batch(
    SEED_STATEMENTS.map((sql) => c.env.DB.prepare(sql)),
  )
  const written = results.reduce((n, r) => n + (r.meta?.changes ?? 0), 0)
  return c.json({ statements: SEED_STATEMENTS.length, written })
})

export default seed
