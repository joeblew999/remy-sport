import { test, expect } from "@playwright/test"

// The Vite SPA (src/web) is served by the Worker itself from the [assets]
// binding, so the GUI and the API share one origin. These tests guard that
// wiring — if the assets binding or the /app route regresses, they fail.

test.describe("SPA served from the Worker", () => {
  test("/app returns the SPA shell, not the server-rendered home page", async ({ request }) => {
    const res = await request.get("/app")
    expect(res.status()).toBe(200)
    const body = await res.text()
    expect(body).toContain('<div id="root">')
    expect(body).toContain("TWEAK_DEFAULTS")
  })

  test("hashed JS bundle is served with the correct content type", async ({ request }) => {
    const shell = await (await request.get("/app")).text()
    const src = shell.match(/src="\.\/(assets\/[^"]+\.js)"/)?.[1]
    expect(src, "SPA shell should reference a hashed JS bundle").toBeTruthy()

    const res = await request.get(`/${src}`)
    expect(res.status()).toBe(200)
    expect(res.headers()["content-type"]).toContain("javascript")
  })

  test("React mounts and renders into #root", async ({ page }) => {
    await page.goto("/app")
    // Router defaults to the discover page when no hash is present.
    await expect(page.locator("#root")).not.toBeEmpty()
    await expect(page.locator("#root *").first()).toBeVisible()
  })

  test("hash deep-link resolves client-side without a server round trip", async ({ page }) => {
    await page.goto("/app#/live")
    await expect(page.locator("#root")).not.toBeEmpty()
    expect(page.url()).toContain("#/live")
  })

  test("the API is reachable from the SPA origin (no CORS needed)", async ({ page }) => {
    await page.goto("/app")
    const status = await page.evaluate(async () => {
      const r = await fetch("/api/events")
      return r.status
    })
    expect(status).toBe(200)
  })
})
