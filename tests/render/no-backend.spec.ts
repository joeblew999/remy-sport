import { test, expect } from "./fixture"
import { ROUTES } from "../../src/web/lib/router"

/**
 * Every route, with no backend, rejecting nothing.
 *
 * This tier serves the built SPA over `vite preview` and there is no Worker
 * behind it, so every `/api` and `/rpc` call fails. That is not a limitation
 * here — it is the condition being tested. A page whose data is missing should
 * say so; a page that leaves a promise rejecting is a page that renders
 * *nothing* where a control belongs, and the reader has no way to tell that
 * from a feature that does not exist.
 *
 * ## It has caught this twice
 *
 * `pushState()` rejected when the VAPID key call failed. In
 * notification-settings.tsx that left `state` null, and null rendered the whole
 * notifications section as nothing — no toggle, no message. That shipped, and
 * it is the same visible symptom as the bug the whole Web Push thread started
 * from, reached from a different cause.
 *
 * Then the same call was copied to the app root, where it ran on *every* page.
 * That one surfaced as "an unconfigured relay must not throw" in
 * moq-page.spec.ts — an assertion three files away, about video. A regression
 * that announces itself somewhere unrelated is one nobody will attribute
 * correctly.
 *
 * ## Why a lint rule was never going to do this
 *
 * Both were `void promise.then(...)`, and `void` is precisely the idiom that
 * satisfies `no-floating-promises`: the operator asserts you meant to ignore
 * the result. The rule was satisfied and the promise was still unhandled. This
 * is a runtime property, so it takes a runtime check.
 *
 * ## Adding a route
 *
 * `ROUTES` is exported from the router so this cannot fall behind. A new page
 * is covered the day it is routable, rather than the day somebody remembers to
 * list it here.
 */

for (const route of ROUTES) {
  test(`${route} settles cleanly with nothing behind it`, async ({ page }) => {
    const rejections: string[] = []
    page.on("pageerror", (e) => rejections.push(e.message))

    await page.goto(route === "/" ? "/" : `/${route}`)
    // Long enough for the queries to fail and the effects to run. The failures
    // are local and immediate; this is not waiting on a network.
    await page.waitForTimeout(350)

    expect(
      rejections,
      `${route} left a promise rejecting. A page with no data must say so, not ` +
        "render nothing — see the note at the top of this file.",
    ).toEqual([])

    // And the app is still there: a crash boundary catching the whole tree
    // would also produce zero unhandled rejections.
    await expect(page.locator("#root")).not.toBeEmpty()
  })
}

/**
 * What the reader sees when we could not find out.
 *
 * The rejection is only half the bug. The other half is that `state` stayed
 * null and null rendered *nothing* — so a reader whose network dropped saw a
 * notifications section with no controls and no explanation, indistinguishable
 * from a build where the feature does not exist.
 *
 * `PushState` reports a reason for every other case — needs-install,
 * not-configured, denied — and this is the reason it could not express.
 */
test.describe("A push state that could not be determined", () => {
  test("says so, and offers a way to try again", async ({ page }) => {
    await page.goto("/#/profile")
    await expect(page.getByTestId("push-unknown")).toBeVisible()
    await expect(page.getByTestId("push-retry")).toBeVisible()
    // Not the blank that shipped: the section renders something a reader can
    // act on rather than nothing at all.
    await expect(page.getByTestId("notification-settings")).toContainText(/./)
  })

  test("does not claim the deployment has no keys", async ({ page }) => {
    // "not-configured" says push is switched off for this deployment, which
    // sends a reader with a dropped connection to entirely the wrong place.
    await page.goto("/#/profile")
    await expect(page.getByTestId("push-unknown")).toBeVisible()
    await expect(page.getByTestId("push-blocked")).toHaveCount(0)
  })

  test("retrying asks again", async ({ page }) => {
    let asked = 0
    await page.route("**/rpc/**", (route) => {
      if (route.request().url().includes("notifications/key")) asked++
      return route.fallback()
    })
    await page.goto("/#/profile")
    await expect(page.getByTestId("push-retry")).toBeVisible()
    const before = asked
    await page.getByTestId("push-retry").click()
    // Still failing, so still honest — but it did go and ask.
    await expect.poll(() => asked).toBeGreaterThan(before)
    await expect(page.getByTestId("push-unknown")).toBeVisible()
  })
})
