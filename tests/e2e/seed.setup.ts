import { test as setup, expect } from "@playwright/test"
import { SEED_ENTITIES } from "../../src/domain/model/entities"

/**
 * Seed the target database before any test project runs.
 *
 * Seeding used to be an ordinary test inside a `describe.serial` block, but
 * `fullyParallel: true` only orders tests *within* a block — the "Layer 1"
 * and "Dashboard GUI" blocks were dispatched to other workers concurrently
 * with the seed block and signed in against users that did not exist yet
 * ("User not found { email: 'admin@remy.dev' }"). That surfaced as four
 * failures whose real cause was ordering, not authorization.
 *
 * A setup project runs to completion before its dependents start, and unlike
 * `globalSetup` it runs *after* the webServer is up, so it can reach the API.
 *
 * The endpoint executes src/db/seed.sql — the same statements the worker tests
 * apply — and every one is `INSERT OR IGNORE`, so this is safe against both a
 * fresh local D1 and an already-seeded remote.
 */
setup("seed actors and reference data", async ({ request }) => {
  // Prune first. Sessions accumulate one per sign-in and never expire inside a
  // 30-day window, so a machine that has run the suite a few dozen times ends
  // up with hundreds — and past roughly a hundred rows `list-sessions` stops
  // returning the newest, which surfaces as "sign-in should succeed: false"
  // in whichever spec happens to run next. The endpoint existed for exactly
  // this; nothing called it. 404s in production, where it does not exist.
  await request.post("/api/dev/prune-sessions").catch(() => undefined)

  const res = await request.post("/api/seed")
  expect(res.ok()).toBeTruthy()
  const body = (await res.json()) as { statements: number; written: number }
  expect(body.statements).toBeGreaterThan(0)

  // Assert the database, not the response. The route used to return a per-user
  // `created | exists` array built from its own bookkeeping, which reported
  // success for a user whose account row had not been written.
  const list = await request.get("/api/events")
  expect(list.ok()).toBeTruthy()
  const { events } = (await list.json()) as { events: unknown[] }
  expect(
    events.length,
    "seed.sql defines the PO's events; the read path should return them",
  ).toBeGreaterThanOrEqual(SEED_ENTITIES.events.length)
})
