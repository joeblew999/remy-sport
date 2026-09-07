import { saveSession } from "../helpers/session-cleanup"
import { test, expect } from "@playwright/test"
import { ACTORS, ADMIN_SIGN_IN, stateFor } from "../helpers/auth"

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
  /**
   * The admin's own screen, so local only — see POLICY in src/environment.ts.
   *
   * `offersAdminSignIn` is false on staging and production because "a deployment
   * never publishes a way in as the account that can impersonate". This file
   * runs entirely as that account, so where the admin cannot sign in there is no
   * session to adopt and the badge reads nothing at all.
   *
   * `ADMIN_SIGN_IN` is measured by `check --e2e` against the origin it is about
   * to test, not inferred from `!IS_LOCAL` — the same signal `auth.setup.ts`
   * uses to decide whether to save an admin state at all, so the two halves
   * cannot disagree about whether that file exists.
   */
  test.skip(!ADMIN_SIGN_IN, "no admin sign-in here — `bun run ops demo on --env X` enables it")

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

// Capture sessions created by UI sign-in or impersonation, including failed assertions.
test.afterEach(async ({ page }) => { await saveSession(page.request) })
