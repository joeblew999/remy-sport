import { test, expect } from "@playwright/test"
import { IS_LOCAL } from "../helpers/auth"

/**
 * A stale service worker cannot shadow the dev server.
 *
 * A browser that once loaded a build from this origin holds a `/sw.js`
 * registration made as a classic script, and that worker serves the built
 * shell from its precache for every navigation — so the dev server's edits
 * never reach the screen. The only exit the browser offers is an update to
 * `/sw.js`, and the dev server used to answer that with an ES module, which a
 * classic registration cannot load. See `legacyWorkerKillSwitch` in
 * src/web/vite.config.ts for the whole story.
 *
 * Two facts hold it: what `/sw.js` is on the dev server, and what happens to a
 * page that registers it the way a build does.
 *
 * Local only: a deployment serves the real worker at that path, and the test
 * would be asking it to leave.
 */
test.describe("a stale service worker cannot shadow the dev server", () => {
  test.skip(!IS_LOCAL, "a deployment serves the real worker at /sw.js")

  test("/sw.js is a classic script whose only job is to leave", async ({ request }) => {
    const res = await request.get("/sw.js")
    expect(res.status()).toBe(200)
    expect(res.headers()["content-type"]).toContain("javascript")
    const body = await res.text()
    // A registration made as a classic script cannot load `import`. The dev
    // worker vite-plugin-pwa serves is full of them, which is why this path
    // must not be that file.
    expect(body, "a classic script, not an ES module").not.toMatch(/^\s*import\s/m)
    expect(body).toContain("skipWaiting()")
    expect(body).toContain("registration.unregister()")
    expect(body).toContain("navigate(")
  })

  test("a page that registers the old worker ends up on the dev worker", async ({ page }) => {
    await page.goto("/")
    // What every build's shell does on load, against the dev server.
    await page.evaluate(() => navigator.serviceWorker.register("/sw.js", { type: "classic" }))
    // The kill switch installs, unregisters itself and reloads the tab; the
    // reloaded page registers the dev worker. Polled through the reload, which
    // destroys the execution context mid-question.
    await expect
      .poll(
        async () => {
          try {
            return await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? "")
          } catch {
            return "navigating"
          }
        },
        { timeout: 15_000 },
      )
      .toContain("dev-sw.js")
  })
})
