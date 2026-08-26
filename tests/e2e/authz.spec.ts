import { test, expect } from "@playwright/test"
import { ACTORS, signIn, signInThroughLoginForm } from "../helpers/auth"
import { EVENT_TYPE_CODES } from "../../src/domain/vocabularies"
import { SEED_ENTITIES } from "../../src/db/seed-data"

// What is LEFT here after ADR 020: only the tests that genuinely drive a
// browser. The request-level six-role matrix — 20 tests that never opened one —
// moved to tests/worker/authz.test.ts, where the Worker runs in workerd and
// they finish in milliseconds instead of taking a slice of a 1.6-minute suite.
//
// All 6 actors from the access matrix, resolved from the
// Product Owner's fixtures via the helpers. This file used to keep its own copy
// of the six addresses — a second list that nothing checked against the seed.
const ADMIN =     { email: ACTORS.ADMIN, role: "admin" }
const ORGANIZER = { email: ACTORS.ORGANIZER, role: "organizer" }
const COACH =     { email: ACTORS.COACH, role: "coach" }
const PLAYER =    { email: ACTORS.PLAYER, role: "player" }
const SPECTATOR = { email: ACTORS.SPECTATOR, role: "spectator" }
const REFEREE =   { email: ACTORS.REFEREE, role: "referee" }

const ALL_ACTORS = [ADMIN, ORGANIZER, COACH, PLAYER, SPECTATOR, REFEREE]
const WRITERS = [ADMIN, ORGANIZER]  // can create/update/delete events
const READERS = [COACH, PLAYER, SPECTATOR, REFEREE]  // read-only for events

// Sign-in lives in tests/helpers/auth.ts now — there are no passwords to post
// (ADR 012), and the code has to be fetched from the dev outbox first.

// ── Seed ────────────────────────────────────────────────────────────────────

test.describe("Layer 1 — event:read is public", () => {
  test("the role switcher actually switches role, not just renders buttons", async ({ page }) => {
    // This is why it broke silently: the old test asserted the six buttons were
    // visible and never clicked one, so the switcher kept posting passwords
    // long after password sign-in was removed (ADR 012).
    await signInThroughLoginForm(page, ADMIN.email)
    await page.goto("/#/admin")
    await expect(page.getByTestId("role-badge")).toHaveText("admin")

    await page.getByTestId("role-switcher").getByRole("button", { name: "Coach" }).click()
    await expect(page.getByTestId("role-badge")).toHaveText("coach", { timeout: 15000 })
  })

})
