import { test, expect } from "./fixture"
import { ROUTES } from "../../src/web/lib/router"
import { as } from "../helpers/actors"
import { open } from "../helpers/surfaces"

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
// On /#/devices since the settings moved there, beside the sessions list —
// the two "device" lists meant different things in different places and both
// said "this device".
test.describe("A push state that could not be determined", () => {
  test("says so, and offers a way to try again", async ({ page }) => {
    await as(page, "ADMIN")
    await open(page, "notifications")
    await expect(page.getByTestId("push-unknown")).toBeVisible()
    await expect(page.getByTestId("push-retry")).toBeVisible()
    // Not the blank that shipped: the section renders something a reader can
    // act on rather than nothing at all.
    await expect(page.getByTestId("notification-settings")).toContainText(/./)
  })

  test("does not claim the deployment has no keys", async ({ page }) => {
    // "not-configured" says push is switched off for this deployment, which
    // sends a reader with a dropped connection to entirely the wrong place.
    await as(page, "ADMIN")
    await open(page, "notifications")
    await expect(page.getByTestId("push-unknown")).toBeVisible()
    await expect(page.getByTestId("push-blocked")).toHaveCount(0)
  })

  test("retrying asks again", async ({ page }) => {
    let asked = 0
    // Seeded BEFORE the counter: Playwright gives the last-registered route
    // precedence, and seedCache installs one of its own — registering it after
    // this meant the counter never saw a request.
    await as(page, "ADMIN")
    await page.route("**/rpc/**", (route) => {
      if (route.request().url().includes("notifications/key")) asked++
      return route.fallback()
    })
    await open(page, "notifications")
    await expect(page.getByTestId("push-retry")).toBeVisible()
    const before = asked
    await page.getByTestId("push-retry").click()
    // Still failing, so still honest — but it did go and ask.
    await expect.poll(() => asked).toBeGreaterThan(before)
    await expect(page.getByTestId("push-unknown")).toBeVisible()
  })
})

/**
 * The dev-only surface for a rejection.
 *
 * Deliberately provoked here, because after the fix above no route rejects on
 * its own — which is the point, and also means nothing else exercises this.
 *
 * The constraint under test is not that it looks right. It is that it renders
 * **outside `#root`**, so the assertions at the top of this file observe
 * exactly what they observed before it existed: a rejection that unmounted the
 * app would collapse "nothing rejected" and "the app still rendered" into one
 * signal and lose the by-name diagnosis.
 */
test.describe("Unhandled rejections in dev", () => {
  /**
   * A rejection the page never handles.
   *
   * `void`, and evaluate returns immediately — returning the promise instead
   * makes Playwright await it, which *handles* it, and then the event never
   * fires. That is the same shape as the bug being guarded against: `void
   * promise` is precisely what makes a rejection unhandled.
   */
  const provoke = () => {
    void Promise.reject(Object.assign(new Error("Not Found"), { code: "NOT_FOUND" }))
  }

  test("shows the rejection, outside the app's root", async ({ page }) => {
    await page.goto("/")
    await expect(page.locator("#root")).not.toBeEmpty()
    await page.evaluate(provoke).catch(() => undefined)

    const panel = page.locator("[data-dev-rejections]")
    await expect(panel).toBeVisible()
    // The code and the message: this is one developer's own browser, where the
    // message is the useful half. ./report.ts beacons only the bounded name.
    await expect(panel).toContainText("NOT_FOUND")
    await expect(panel).toContainText("Not Found")

    // The hard constraint. It is not in the app, so no page selector can see it
    // and React never knows it exists.
    await expect(page.locator("#root [data-dev-rejections]")).toHaveCount(0)
    await expect(page.locator("#root")).not.toBeEmpty()
  })

  test("does not replace the app the way a crash boundary would", async ({ page }) => {
    await page.goto("/")
    await page.evaluate(provoke).catch(() => undefined)
    await expect(page.locator("[data-dev-rejections]")).toBeVisible()
    // Still a working page. A rejection is usually not fatal, and a crash
    // screen for one is false severity a developer learns to dismiss.
    await expect(page.locator(".event-list")).toBeVisible()
    await expect(page.getByTestId("crash")).toHaveCount(0)
  })

  test("a rejection loop does not grow the DOM without bound", async ({ page }) => {
    await page.goto("/")
    await page.evaluate(async () => {
      for (let i = 0; i < 25; i++) {
        void Promise.reject(new Error(`burst ${i}`))
        await new Promise((r) => setTimeout(r, 1))
      }
    })
    // Capped, for the same reason report.ts dedupes the beacon.
    const lines = page.locator("[data-dev-rejections] div")
    await expect.poll(() => lines.count()).toBeLessThanOrEqual(4)
  })

  test("cannot swallow a click meant for the app", async ({ page }) => {
    // Fixed, bottom-right, maximum z-index. Without pointer-events:none it
    // would make whatever sits under it unclickable the moment a rejection
    // happened — and the test that then failed would name a button, not a
    // rejection.
    await page.goto("/")
    await page.evaluate(provoke)
    await expect(page.locator("[data-dev-rejections]")).toBeVisible()
    const swallows = await page.evaluate(() => {
      const box = document.querySelector("[data-dev-rejections]")!
      const r = box.getBoundingClientRect()
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return box.contains(hit)
    })
    expect(swallows, "the panel must not be the element at its own coordinates").toBe(false)
  })

  test("is absent from a production build", async ({ page }) => {
    // The module is imported dynamically behind import.meta.env.DEV, so it is
    // not in the shipped bundle at all — asserted against dist/ in the build,
    // and here only that nothing renders it unprovoked.
    await page.goto("/")
    await expect(page.locator("[data-dev-rejections]")).toHaveCount(0)
  })
})
