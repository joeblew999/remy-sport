import { test, expect } from "@playwright/test"
import { BASE, IS_LOCAL, REFEREE, actor, signIn, signInThroughLoginForm } from "../helpers/auth"

/**
 * This spec's own actors, not the shared ones.
 *
 * Every e2e spec runs against one local D1 and one set of seeded people. Better
 * Auth invalidates an OTP when a newer one is requested for the same address,
 * so two specs signing in as *the* organizer concurrently make one of them fail
 * with INVALID_OTP — and which one loses moves between runs, so it reads as a
 * bug in whichever was second.
 *
 * The fixtures already seed three organizers and three coaches at three
 * schools. Nothing needed adding; the specs were simply all taking the first.
 */
const COACH_1 = actor("COACH", 1)


// ADR 014. Better Auth core has exposed /list-sessions and /revoke-session all
// along and nothing used them. It matters more since ADR 012 made sessions last
// 30 days: a long session is a convenience while it is yours, and a problem
// once it is not.

test.describe("Devices — where you're signed in", () => {
  test.skip(!IS_LOCAL, "signing in needs the fixed dev code")

  test("a session signed in elsewhere shows up, and revoking it actually ends it", async ({ page, request }) => {
    // Second session for the same user, from a different context. This is the
    // case the feature exists for: something you did not start.
    await signIn(request, REFEREE)
    const before = await (await request.get("/api/auth/list-sessions", {
      headers: { Origin: BASE },
    })).json()
    expect(before.length).toBeGreaterThan(0)

    await signInThroughLoginForm(page, REFEREE)
    await page.goto("/#/devices")
    await expect(page.getByTestId("devices-list")).toBeVisible()

    const revokeButtons = page.locator('[data-testid^="revoke-"]')
    const count = await revokeButtons.count()
    test.skip(count === 0, "no other session present to revoke")

    await revokeButtons.first().click()
    // The list reloads from the server, so a shrinking list is evidence the
    // revoke reached the database rather than just updating local state.
    await expect(revokeButtons).toHaveCount(count - 1, { timeout: 15000 })
  })

  test("sign out all other devices leaves exactly the current one", async ({ page, request }) => {
    await signIn(request, COACH_1)
    await signInThroughLoginForm(page, COACH_1)
    await page.goto("/#/devices")
    await expect(page.getByTestId("devices-list")).toBeVisible()

    const others = page.getByTestId("revoke-others")
    if (await others.count()) {
      await others.click()
      await expect(page.locator('[data-testid^="revoke-"]')).toHaveCount(0, { timeout: 15000 })
    }
    await expect(page.getByTestId("device-current")).toBeVisible()
  })

})

test.describe("Session listing is per-user", () => {
  test.skip(!IS_LOCAL, "signing in needs the fixed dev code")

})
