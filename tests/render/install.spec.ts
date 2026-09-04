import { test, expect } from "./fixture"
import { sessionFor } from "../helpers/actors"
import { visit } from "../helpers/surfaces"
import { seedCache } from "../helpers/seed-cache"

/**
 * The install prompt must never cover the app.
 *
 * `<pwa-install>` used to prompt on arrival, and on a real origin it put its
 * dialog over everything at z-index 2147483001 — the first e2e run against a
 * deployment could not click Sign out, and Playwright named the element.
 * Thirty-four local runs had passed, because localhost never meets the install
 * criteria and the element stays inert here.
 *
 * That is the trap this file exists for: the condition could not occur in the
 * tier that was testing it, so the only honest thing to assert locally is that
 * the element is mounted and *inert*. `manual-apple` and `manual-chrome` are
 * what keep it that way; the account menu opens it when a reader asks.
 *
 * The dialog itself — the icon, the manifest screenshots, the iOS steps — is
 * the component's, and is why it is here rather than eighty lines of our own.
 */
test.describe("The install prompt", () => {
  test("is mounted, and does not intercept clicks", async ({ page }) => {
    await seedCache(page, [sessionFor("COACH")])
    await visit(page, "discover")

    await expect(page.locator("pwa-install")).toHaveCount(1)

    /**
     * The regression, asserted the only way that would have caught it: click
     * something else and require that it works. Checking the element exists
     * would have passed on the day this broke.
     */
    await page.getByTestId("topbar-user").click({ timeout: 5_000 })
  })

  test("is set to manual, so it cannot prompt on arrival", async ({ page }) => {
    await seedCache(page, [sessionFor("COACH")])
    await visit(page, "discover")

    // Without both of these the component decides for itself when to appear,
    // which is exactly what put a dialog over the app on staging.
    const el = page.locator("pwa-install")
    await expect(el).toHaveAttribute("manual-apple", "true")
    await expect(el).toHaveAttribute("manual-chrome", "true")
  })
})
