import { test, expect } from "@playwright/test"
import { IS_LOCAL } from "../helpers/auth"

/**
 * The entry module runs once.
 *
 * Fast Refresh gives every module with a component a self-import by its bare
 * URL, and after the first edit of a dev session Vite serves the entry as
 * `main.tsx?t=…` — a different module from `main.tsx`. The entry then ran
 * twice: two React roots, two query caches, two apps on one hash. See the
 * note on the react plugin in src/web/vite.config.ts.
 *
 * Held here at the source: the entry, as the dev server serves it, must carry
 * no import of itself. The count of loads is asked too, though it can only
 * fail on a server that has seen an edit — which is a developer's, and the
 * one where it mattered.
 *
 * Local only: a deployment serves a built bundle and has no `/main.tsx`.
 */
test.describe("the entry module runs once", () => {
  test.skip(!IS_LOCAL, "a deployment serves a built bundle, not the entry")

  test("the served entry does not import itself", async ({ request }) => {
    const res = await request.get("/main.tsx")
    expect(res.status()).toBe(200)
    const body = await res.text()
    expect(body, "no Fast Refresh self-import on the entry").not.toMatch(/from\s+["']\/main\.tsx["']/)
  })

  test("a page loads the entry once", async ({ page }) => {
    await page.goto("/")
    await expect(page.locator(".page")).toBeVisible()
    const loads = await page.evaluate(() =>
      performance.getEntriesByType("resource").filter((e) => /\/main\.tsx(\?|$)/.test(e.name)).length,
    )
    expect(loads, "one load of the entry, whatever query Vite put on it").toBe(1)
  })
})
