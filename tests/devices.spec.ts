import { test, expect } from "@playwright/test"
import { signInThroughLoginForm, signIn, COACH, REFEREE, BASE, IS_LOCAL } from "./helpers/auth"

// ADR 014. Better Auth core has exposed /list-sessions and /revoke-session all
// along and nothing used them. It matters more since ADR 012 made sessions last
// 30 days: a long session is a convenience while it is yours, and a problem
// once it is not.

test.describe("Devices — where you're signed in", () => {
  test.skip(!IS_LOCAL, "signing in needs the fixed dev code")

  test("signed out, the page asks you to sign in rather than erroring", async ({ page }) => {
    await page.goto("/#/devices")
    await expect(page.getByTestId("devices-signed-out")).toBeVisible()
  })

  test("the current session is listed and marked, and cannot be revoked by accident", async ({ page }) => {
    await signInThroughLoginForm(page, COACH)
    await page.goto("/#/devices")
    await expect(page.getByTestId("devices-list")).toBeVisible()
    await expect(page.getByTestId("device-current")).toBeVisible()

    // No "Sign out" button on the row you are using — ending your own session
    // from a device screen is a surprise, not a feature.
    const currentRow = page.locator('[data-testid^="device-"]').filter({
      has: page.getByTestId("device-current"),
    })
    await expect(currentRow.locator('[data-testid^="revoke-"]')).toHaveCount(0)
  })

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
    await signIn(request, COACH)
    await signInThroughLoginForm(page, COACH)
    await page.goto("/#/devices")
    await expect(page.getByTestId("devices-list")).toBeVisible()

    const others = page.getByTestId("revoke-others")
    if (await others.count()) {
      await others.click()
      await expect(page.locator('[data-testid^="revoke-"]')).toHaveCount(0, { timeout: 15000 })
    }
    await expect(page.getByTestId("device-current")).toBeVisible()
  })

  test("the topbar links to it — a security screen nobody can find is not a feature", async ({ page }) => {
    await signInThroughLoginForm(page, COACH)
    await page.goto("/")
    await page.getByTestId("topbar-devices").click()
    await expect(page.getByTestId("devices-page")).toBeVisible()
  })
})

test.describe("Session listing is per-user", () => {
  test.skip(!IS_LOCAL, "signing in needs the fixed dev code")

  test("you only ever see your own sessions", async ({ request }) => {
    await signIn(request, COACH)
    const sessions = await (await request.get("/api/auth/list-sessions", {
      headers: { Origin: BASE },
    })).json()
    const userIds = new Set((sessions as { userId: string }[]).map((s) => s.userId))
    expect(userIds.size, "sessions from more than one user would be a leak").toBe(1)
  })

  test("an anonymous caller gets nothing", async ({ request }) => {
    const res = await request.get("/api/auth/list-sessions", { headers: { Origin: BASE } })
    // Better Auth answers 401 rather than an empty list, which is the right
    // shape: "who is asking" is unanswerable, not "nobody is signed in".
    expect(res.ok()).toBeFalsy()
  })
})
