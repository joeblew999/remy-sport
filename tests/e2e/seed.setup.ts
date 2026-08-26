import { test as setup, expect } from "@playwright/test"
import { SEED_ENTITIES } from "../../src/db/seed-data"

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
 * The endpoint is idempotent, so this is safe against both a fresh local D1
 * and an already-seeded remote.
 */
setup("seed actors and ensure a public event exists", async ({ request }) => {
  const res = await request.post("/api/seed")
  expect(res.ok()).toBeTruthy()

  const body = await res.json()
  // Against the fixtures, not a number typed here: the seeded actors are the
  // PO's people, and there are as many of them as the fixtures say.
  expect(body.seeded).toHaveLength(SEED_ENTITIES.users.length)

  // The "event:read is public" tests assert that at least one event exists, but
  // nothing guarantees an event-creating test has run first — they live in a
  // different describe block and run concurrently. Locally that passed only
  // because the local D1 kept events from previous runs; against a freshly
  // provisioned remote D1 the table is empty and both tests failed.
  //
  // Guaranteeing the fixture here removes the dependency on leftover state.
  // Sessions accumulate one per sign-in and nothing expires them locally. Past
  // ~100 rows for a user, list-sessions stops returning the newest one and the
  // devices page cannot identify the current session (ADR 014). 404s in
  // production, where this endpoint does not exist.
  await request.post("/api/dev/prune-sessions").catch(() => undefined)

  const list = await request.get("/api/events")
  expect(list.ok()).toBeTruthy()
  if ((await list.json()).events.length > 0) return

  await signIn(request, ADMIN)

  const created = await request.post("/api/events", {
    data: { names: { en: "Seed event" }, typeCode: "TOURNAMENT" },
  })
  expect(created.status()).toBe(201)
})
