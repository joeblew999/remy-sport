import { test, expect } from "./fixture"
import { VISITOR, sessionFor } from "../helpers/actors"
import { visit } from "../helpers/surfaces"
import { seedCache } from "../helpers/seed-cache"

/**
 * The devices screen, rendered — with the session and the device list seeded.
 *
 * These assert what the page does with a list of sessions: is the current one
 * marked, is it protected from being revoked by accident, is the screen
 * reachable. None of that needs a real session to exist.
 *
 * tests/worker/session-revocation.test.ts verifies that revocation ends the
 * targeted sessions while preserving the caller and unrelated users, against
 * a real Worker. tests/e2e/devices.spec.ts drives the browser controls and
 * verifies reload persistence, including failure and retry.
 */

const signedIn = sessionFor("COACH")

/** Shape of `useDevices` — Better Auth's list plus which token is ours. */
const devices = {
  queryKey: ["devices"] as readonly unknown[],
  data: {
    currentToken: "tok_here",
    sessions: [
      {
        id: "s1",
        token: "tok_here",
        userId: "u_coach",
        userAgent: "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        createdAt: "2026-08-20T10:00:00.000Z",
        updatedAt: "2026-08-26T10:00:00.000Z",
        expiresAt: "2026-09-20T10:00:00.000Z",
      },
      {
        id: "s2",
        token: "tok_elsewhere",
        userId: "u_coach",
        userAgent: "Mozilla/5.0 (iPhone) AppleWebKit/605.1 Version/17 Mobile Safari/604.1",
        createdAt: "2026-08-22T10:00:00.000Z",
        updatedAt: "2026-08-25T10:00:00.000Z",
        expiresAt: "2026-09-22T10:00:00.000Z",
      },
    ],
  },
}

test.describe("Devices", () => {
  test("signed out, the page asks you to sign in rather than erroring", async ({ page }) => {
    await seedCache(page, [VISITOR])
    await visit(page, "sessions")
    await expect(page.getByTestId("devices-signed-out")).toBeVisible()
  })

  test("the current session is marked, and cannot be revoked by accident", async ({ page }) => {
    await seedCache(page, [signedIn, devices])
    await visit(page, "sessions")
    await expect(page.getByTestId("devices-list")).toBeVisible()
    await expect(page.getByTestId("device-current")).toBeVisible()

    // No "Sign out" button on the row you are using — ending your own session
    // from a device screen is a surprise, not a feature.
    const currentRow = page
      .locator('[data-testid^="device-"]')
      .filter({ has: page.getByTestId("device-current") })
    await expect(currentRow.locator('[data-testid^="revoke-"]')).toHaveCount(0)
  })

  test("the topbar links to it — a security screen nobody can find is not a feature", async ({
    page,
  }) => {
    await seedCache(page, [signedIn, devices])
    await visit(page, "discover")
    // The Devices link is a menu item in the account dropdown (B2 step 8).
    await page.getByTestId("account").click()
    await page.getByTestId("account-devices").click()
    await expect(page.getByTestId("devices-page")).toBeVisible()
  })
})
