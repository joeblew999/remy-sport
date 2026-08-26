import { test, expect } from "@playwright/test"

test.describe("The root serves the one GUI", () => {
  // These replace three tests against the server-rendered home page that ADR
  // 020 deleted. The interesting assertion is no longer "does the marketing
  // copy render" but "does `/` serve the SPA at all" — `not_found_handling` is
  // "none" in wrangler.toml, so a missing route here is a 404, not a fallback.
  test("/ serves the SPA document", async ({ page }) => {
    await page.goto("/")
    await expect(page.locator("#root")).toBeAttached()
  })

  test("the deleted harness paths are gone, not redirected", async ({ page }) => {
    // No aliases for /app, /login or /dashboard. There are no users, so nothing
    // holds a link to them, and a redirect kept "just in case" is how two URLs
    // for one page become permanent.
    for (const path of ["/app", "/dashboard"]) {
      const res = await page.goto(path)
      expect(res?.status(), `${path} should not resolve`).toBe(404)
    }
  })

  test("a deep link resolves client-side rather than 404ing", async ({ page }) => {
    await page.goto("/#/admin")
    await expect(page.locator("#root")).toBeAttached()
  })
})

test.describe("Health endpoint", () => {
})
