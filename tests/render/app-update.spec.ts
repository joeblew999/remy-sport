import { test, expect } from "./fixture"
import { visit } from "../helpers/surfaces"

/**
 * A reader gets the build that is deployed, without being asked to notice.
 *
 * A service worker precaches the built shell and answers navigations from it, so
 * a returning reader keeps whatever was deployed the last time they visited. On
 * 2026-09-10 production moved a week and 284 commits forward and the site still
 * showed the previous interface to a browser holding a cached one. Nothing was
 * broken — the Worker served the new bundle and `curl` proved it — and the
 * reader saw the old one.
 *
 * **Every check was blind to it.** Smoke is `curl`-shaped, and the browser tiers
 * launch a fresh context that has never held a service worker, so no test this
 * repository owns has ever been a *returning* visitor. The gap was found by a
 * person opening the page.
 *
 * The fix is not to reload the moment a worker is ready: this product has live
 * score entry, and a page pulled out from under somebody mid-form loses what
 * they typed. It is to take the update at the reader's next navigation, where
 * they have finished with whatever they were doing and the page is being
 * replaced anyway.
 *
 * That is what this asserts, and it is asserted through the same event the
 * shell raises — `remy:update-ready` — rather than by installing a stale worker,
 * because the behaviour under test is "what happens once an update is known",
 * not the browser's worker lifecycle.
 */
test.describe("When a new build is waiting", () => {
  test("it is taken at the reader's next navigation, not under their hands", async ({ page }) => {
    await visit(page, "teams")

    /**
     * Stand down the build stamp's localhost-only reload, the way a second
     * visit does.
     *
     * On localhost a stale bundle reloads itself once, so an agent editing code
     * is not left reasoning about the previous build — deliberate, and gated to
     * localhost in build-stamp.tsx. This tier *is* localhost, so without this
     * the page reloads on the event and the boundary being tested never
     * happens. The component skips that reload when it has already done it for
     * the loaded bundle, which is the state every real reader is in.
     */
    await page.evaluate(() => {
      const loaded = document.querySelector<HTMLScriptElement>('script[type="module"][src]')
      sessionStorage.setItem("remy:auto-reloaded-for", loaded?.getAttribute("src") ?? "")
    })

    // A value that cannot survive a document being replaced.
    await page.evaluate(() => {
      ;(window as unknown as { __beforeUpdate?: number }).__beforeUpdate = Date.now()
    })
    expect(await page.evaluate(() => "__beforeUpdate" in window)).toBe(true)

    // An update arrives while they are reading. Nothing must happen yet.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("remy:update-ready")))
    await page.waitForTimeout(300)
    expect(
      await page.evaluate(() => "__beforeUpdate" in window),
      "a waiting update must not reload the page under the reader",
    ).toBe(true)

    // They navigate. That is the boundary: the page is being replaced anyway.
    await page.evaluate(() => { window.location.hash = "#/orgs" })
    await page.waitForLoadState("load")

    await expect
      .poll(
        () => page.evaluate(() => "__beforeUpdate" in window),
        { message: "navigating with an update waiting must take the new build" },
      )
      .toBe(false)
    // And it lands where they were going, not back where they started.
    expect(page.url()).toContain("#/orgs")
  })
})
