import { test, expect } from "@playwright/test"
import { ACTORS, stateFor } from "../helpers/auth"

// What is LEFT here after ADR 020: only the tests that genuinely drive a
// browser. The request-level six-role matrix — 20 tests that never opened one —
// moved to tests/worker/authz.test.ts, where the Worker runs in workerd and
// they finish in milliseconds instead of taking a slice of a 1.6-minute suite.
//
// The six actor consts, WRITERS/READERS and the vocabulary imports went with
// them; only the switcher below is left, and it needs one address.

/**
 * Start already signed in, from the cookies auth.setup.ts saved.
 *
 * This used to sign in through the login form, which made it the second place
 * requesting a sign-in code for the admin while admin-console.spec.ts was doing
 * the same in another worker. `generateOTP` returns a fixed value under
 * TEST_OTP, but Better Auth still writes and consumes a verification row per
 * request, so the two invalidate each other and whichever verifies second gets
 * "Invalid OTP" — measured at 4 failures in 5 full runs.
 *
 * Nothing about this test's subject is the login form. The switcher is.
 */
test.use({ storageState: stateFor(ACTORS.ADMIN) })

test.describe("Layer 1 — event:read is public", () => {
  test("the role switcher actually switches role, not just renders buttons", async ({ page }) => {
    // This is why it broke silently: the old test asserted the six buttons were
    // visible and never clicked one, so the switcher kept posting passwords
    // long after password sign-in was removed (ADR 012).
    await page.goto("/#/admin")
    await expect(page.getByTestId("role-badge")).toHaveText("admin")

    await page.getByTestId("role-switcher").getByRole("button", { name: "Coach" }).click()
    await expect(page.getByTestId("role-badge")).toHaveText("coach", { timeout: 15000 })
  })
})
