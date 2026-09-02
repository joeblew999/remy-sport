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
/**
 * The install prompt, dismissed before the page loads.
 *
 * `<pwa-install>` is a fixed overlay, and on a phone it is a bottom sheet — so
 * in this tier it sits on top of whatever a spec is looking at. It covered the
 * device list in every screenshot of the notification settings, and anything
 * asserting a click near the bottom of a page is one layout change away from
 * hitting it instead.
 *
 * Suppressed the way the component itself does it, rather than by hiding it in
 * CSS or not rendering it: main.tsx passes `use-local-storage`, so the
 * component reads this flag and stays down. A test that switched it off by a
 * different mechanism than the product uses would prove less than it appears
 * to.
 *
 * This tier never asserts anything about the prompt — the states it can be in
 * are covered where they belong, against a real browser, because a headless
 * WebKit will not fire `beforeinstallprompt` at all.
 */
const HIDE_INSTALL_PROMPT = () => {
  try {
    localStorage.setItem("pwa-hide-install", "true")
  } catch {
    /* private mode, or storage disabled: the prompt is cosmetic here */
  }
}

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort())
    await page.addInitScript(HIDE_INSTALL_PROMPT)
    await use(page)
  },
})

export { expect }
