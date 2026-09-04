import { test, expect } from "./fixture"
import { sessionFor } from "../helpers/actors"
import { visit } from "../helpers/surfaces"
import { seedCache } from "../helpers/seed-cache"

/**
 * Offering to install the app.
 *
 * `@khmyznikov/pwa-install` prompted on arrival at z-index 2147483001, and the
 * first e2e run against a real deployment could not click Sign out — Playwright
 * named the element. Thirty-four local runs had passed, because localhost never
 * meets the install criteria and the component stayed inert.
 *
 * These tests fire the platform event themselves, which is what localhost never
 * does. That is the whole reason the bug reached staging: the condition under
 * test could not occur in the tier that was testing it.
 */
const fireInstallPrompt = (page: Parameters<typeof visit>[0]) =>
  page.evaluate(() => {
    const e = new Event("beforeinstallprompt") as Event & {
      prompt?: () => Promise<void>
      userChoice?: Promise<{ outcome: string }>
    }
    e.prompt = () => Promise.resolve()
    e.userChoice = Promise.resolve({ outcome: "accepted" })
    window.dispatchEvent(e)
  })

test.describe("Installing the app", () => {
  test("is not offered until the browser says it is possible", async ({ page }) => {
    await seedCache(page, [sessionFor("COACH")])
    await visit(page, "discover")

    // The default state everywhere, including every other render test: no
    // event, so no offer. A button here would be the guess the old comment in
    // topbar.tsx objected to.
    await expect(page.getByTestId("install-app")).toHaveCount(0)
  })

  test("appears once the browser offers, and nothing covers the page", async ({ page }) => {
    await seedCache(page, [sessionFor("COACH")])
    await visit(page, "discover")
    await fireInstallPrompt(page)

    await expect(page.getByTestId("install-app")).toBeVisible()

    /**
     * The actual regression. The old component put a fixed dialog over
     * everything at z-index 2147483001, so whatever sat underneath could not be
     * clicked. Asserting the offer exists would not have caught that — this
     * asserts the page still works while it is showing.
     */
    await page.getByTestId("topbar-user").click({ timeout: 5_000 })
  })

  test("asking removes the offer, because the event is spent", async ({ page }) => {
    await seedCache(page, [sessionFor("COACH")])
    await visit(page, "discover")
    await fireInstallPrompt(page)
    await page.getByTestId("install-app").click()

    // Chromium refuses a second prompt on the same event, so an offer that
    // stayed would be a button that does nothing the next time.
    await expect(page.getByTestId("install-app")).toHaveCount(0)
  })
})
