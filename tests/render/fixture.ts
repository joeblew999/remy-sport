import { test as base, expect } from "@playwright/test"

/**
 * The render tier's `test`, with the network genuinely off.
 *
 * These tests assert what the DOM says about data they were handed. They do not
 * assert typography — but the SPA links Inter, IBM Plex Mono and Space Grotesk
 * from Google Fonts, and a single woff2 was taking 3.1s. That was a uniform 3.1s
 * on *every* test in this tier, and it was the entire cost of the tier.
 *
 * Blocking it is not a shortcut around a real dependency: there is no network
 * here by design (the whole point of `seedCache`), and a font that fails to load
 * changes glyph rendering, not `textContent`.
 *
 * Import `test` and `expect` from here rather than from @playwright/test, so a
 * new render spec cannot quietly reintroduce the wait.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort())
    await use(page)
  },
})

export { expect }
