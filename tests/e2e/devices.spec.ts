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
  /**
   * Runs on a deployment too. The skip here said "signing in needs the fixed dev
   * code", which stopped being true when staging took `signInCode: "derived"` —
   * it has the same fixed code, and this file signs in as a referee and a coach,
   * never the admin, which is the only account a deployment refuses.
   *
   * Verified against staging on 2026-09-03: both actors sign in with the demo
   * code and return 200. On production the code lives in a secret, and
   * `check --e2e` asks the deployment whether it will accept it before running
   * anything — so the condition this skip was guessing at is now measured.
   *
   * Worth having remotely more than most: revoking a session is the one feature
   * whose whole point is that it reaches the database, and a deployment is the
   * only place with a real one.
   */

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
    await expect(page.getByTestId("devices-list")).toBeVisible({ timeout: 15000 })

    /**
     * One named row, not a count.
     *
     * This asserted `count - 1` on `[data-testid^="revoke-"]`, which is a claim
     * about the whole table — and the table is not this test's to own. The suite
     * runs against a live system on purpose, so a session can appear underneath
     * it at any moment: another worker signing in as this actor, another run, or
     * on a deployment a real person. Measured 2026-09-03 against dev: expected 8,
     * received 9, because one arrived mid-assertion. Nothing was broken.
     *
     * The selector was wrong in a second way too — `revoke-others` starts with
     * `revoke-`, so the count silently included the bulk button, and the
     * arithmetic only worked while at least two other sessions existed.
     *
     * Revoking a row and watching THAT row disappear is the same evidence, and
     * it is evidence this test owns: the id comes from the element it clicked.
     */
    const rows = page.locator('[data-testid^="revoke-"]:not([data-testid="revoke-others"])')
    await expect(rows.first()).toBeVisible({ timeout: 15000 })

    /**
     * Read the id, then click BY that id — not `rows.first()` twice.
     *
     * A Playwright locator is lazy: `rows.first()` re-resolves every time it is
     * used. `toDevices` sorts by `lastSeen`, and every request touches a session,
     * so the order genuinely changes between one call and the next. Reading the
     * id from `.first()` and then clicking `.first()` revoked whichever row had
     * become first, and then asserted the one we had read was gone — a different
     * session, still present, correctly. "Expected 0, received 1", from a revoke
     * that worked perfectly.
     */
    const id = await rows.first().getAttribute("data-testid")
    expect(id, "a revocable row should identify itself").toBeTruthy()

    await page.locator(`[data-testid="${id}"]`).click()
    // Gone from the list, which reloads from the server — so this is evidence
    // the revoke reached the database rather than only local state.
    await expect(page.locator(`[data-testid="${id}"]`)).toHaveCount(0, { timeout: 15000 })
  })

  test("sign out all other devices leaves exactly the current one", async ({ page, request }) => {
    await signIn(request, COACH_1)
    await signInThroughLoginForm(page, COACH_1)
    await page.goto("/#/devices")
    await expect(page.getByTestId("devices-list")).toBeVisible({ timeout: 15000 })

    /**
     * The rows this test can see when it presses the button must all be gone.
     *
     * `toHaveCount(0)` on every `revoke-` element was the same over-claim as
     * above, and it is the one that cannot hold on a live system at all: a
     * session created while the request is in flight is a NEW row, correctly
     * present, and the assertion reads it as a failed revoke. On a deployment
     * with real people that is not a rare race, it is the normal case.
     *
     * So the rows are captured first and each is asserted gone by id. That is
     * exactly what the button promises — the others at the moment you pressed it
     * — and it stays true however busy the account is.
     */
    const rowsOf = () =>
      page.locator('[data-testid^="revoke-"]:not([data-testid="revoke-others"])')

    const others = page.getByTestId("revoke-others")
    if (await others.count()) {
      const ids = (await rowsOf().evaluateAll((els) =>
        els.map((el) => el.getAttribute("data-testid")),
      )).filter((id): id is string => Boolean(id))

      await others.click()
      for (const id of ids) {
        await expect(page.locator(`[data-testid="${id}"]`)).toHaveCount(0, { timeout: 15000 })
      }
    }
    // And the one you are using survives, which is the other half of the promise.
    await expect(page.getByTestId("device-current")).toBeVisible()
  })

})

test.describe("Session listing is per-user", () => {
  test.skip(!IS_LOCAL, "signing in needs the fixed dev code")

})
