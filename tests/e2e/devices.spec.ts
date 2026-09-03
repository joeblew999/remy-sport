import { test, expect } from "@playwright/test"
import { BASE, freshActor, signIn, signInThroughLoginForm } from "../helpers/auth"

/**
 * "Where am I signed in?" — ADR 014, tested on an account nobody else touches.
 *
 * This spec is the reason `freshActor()` exists. Its subject is *how many*
 * sessions a person has and what ending one does, which is the one thing that
 * cannot be asserted about a shared account: the dev tunnel is there so a person
 * can use the app while the suite runs, and every other spec signs in as the
 * same seeded people. Sessions appeared under a running assertion; `.first()`
 * pointed at a different row by the time it was clicked, because the list sorts
 * by `lastSeen` and every request touches a session; and "sign out all other
 * devices" would have signed the reader out.
 *
 * Each test mints its own account instead. It then owns every session on it, so
 * counting them is exact, `revoke-others` reaches only this test's sessions, and
 * nothing anyone else does is visible here. Two sign-ins, two sessions — no
 * `test.skip` guarding a count, no ownership gymnastics, no shared-actor index.
 *
 * Runs on every environment. The fixed code covers the reserved address space on
 * dev and staging, and on production once `ops -- demo on` has been run — which
 * `check --e2e` verifies before starting rather than assuming.
 */
test.describe("Devices — where you're signed in", () => {
  /**
   * Longer than the default 30s, because of what these tests actually do.
   *
   * Each one performs two or three complete OTP sign-ins against a real Worker —
   * request a code, read it back, redeem it, wait for the identity to appear —
   * before it can even open the page. That is most of the budget, and then the
   * assertions wait up to 15s each on a list that round-trips two endpoints.
   *
   * The timeout was what actually failed, and it did not look like one: Playwright
   * reports a timeout against whatever line it had reached, so it surfaced as
   * "Received: undefined" and as an assertion on a row count. Measured after the
   * account isolation landed, the server state was exactly right every time —
   * two sessions, revoke the correct one, one left — while the test was being
   * killed before it could see it.
   *
   * Raised rather than trimmed: the sign-ins are the fidelity. This spec is about
   * sessions, and faking the way they are created would remove the only thing it
   * is testing.
   */
  test.setTimeout(90_000)

  test("a session signed in elsewhere shows up, and revoking it actually ends it", async ({ page, request }) => {
    const me = freshActor()

    // Two sessions on a brand-new account: one from an API context, one from the
    // browser. The API one is the case the feature exists for — something you
    // did not start — and on this account it is the ONLY other one.
    await signIn(request, me)
    await signInThroughLoginForm(page, me)

    await page.goto("/#/devices")
    await expect(page.getByTestId("devices-list")).toBeVisible({ timeout: 15000 })

    // Exactly one revocable row, because exactly one other session exists.
    const rows = page.locator('[data-testid^="revoke-"]:not([data-testid="revoke-others"])')
    await expect(rows).toHaveCount(1, { timeout: 15000 })

    await rows.first().click()
    // The list reloads from the server, so an empty list is evidence the revoke
    // reached the database rather than only local state.
    await expect(rows).toHaveCount(0, { timeout: 15000 })
    // And this browser is still signed in — the session that ended was the other.
    await expect(page.getByTestId("device-current")).toBeVisible()
  })

  test("sign out all other devices leaves exactly the current one", async ({ page, request, playwright }) => {
    const me = freshActor()

    // Three sessions: two from API contexts and the browser's own, so "all
    // others" has more than one thing to do.
    await signIn(request, me)
    const second = await playwright.request.newContext({ baseURL: BASE })
    await signIn(second, me)
    await signInThroughLoginForm(page, me)

    await page.goto("/#/devices")
    await expect(page.getByTestId("devices-list")).toBeVisible({ timeout: 15000 })

    const rows = page.locator('[data-testid^="revoke-"]:not([data-testid="revoke-others"])')
    await expect(rows).toHaveCount(2, { timeout: 15000 })

    // Safe to press only because this account is this test's. On a shared one it
    // would end the sessions of whoever else was signed in as that person.
    await page.getByTestId("revoke-others").click()
    await expect(rows).toHaveCount(0, { timeout: 15000 })
    await expect(page.getByTestId("device-current")).toBeVisible()

    await second.dispose()
  })
})
