import { test, expect } from "@playwright/test"
import { seedCache } from "../helpers/seed-cache"
import { sessionKey } from "../../src/web/lib/session"

/**
 * The devices screen, rendered — with the session and the device list seeded.
 *
 * These assert what the page does with a list of sessions: is the current one
 * marked, is it protected from being revoked by accident, is the screen
 * reachable. None of that needs a real session to exist.
 *
 * What stayed in devices.spec.ts is the pair that cannot be faked: revoking a
 * session somewhere else and watching it actually end, and "sign out all other
 * devices" leaving exactly one. Those are the security promise, and the promise
 * is that the *server* forgets — so they run against a real Worker.
 */

const signedIn = {
  queryKey: sessionKey as unknown as readonly unknown[],
  data: {
    user: { id: "u_coach", email: "coach@remy.test", name: "Coach", role: "coach" },
    session: { activeOrganizationId: null, impersonatedBy: null },
  },
}

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
    await seedCache(page, [{ queryKey: sessionKey as unknown as readonly unknown[], data: null }])
    await page.goto("/#/devices")
    await expect(page.getByTestId("devices-signed-out")).toBeVisible()
  })

  test("the current session is marked, and cannot be revoked by accident", async ({ page }) => {
    await seedCache(page, [signedIn, devices])
    await page.goto("/#/devices")
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
    await page.goto("/")
    await page.getByTestId("topbar-devices").click()
    await expect(page.getByTestId("devices-page")).toBeVisible()
  })
})
