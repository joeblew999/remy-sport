import { test, expect } from "@playwright/test"

// The Vite SPA (src/web) is served by the Worker itself from the [assets]
// binding, so the GUI and the API share one origin. These tests guard that
// wiring — if the assets binding or the root route regresses, they fail.

test.describe("SPA served from the Worker", () => {
  test("the API is reachable from the SPA origin (no CORS needed)", async ({ page }) => {
    await page.goto("/")
    const status = await page.evaluate(async () => {
      const r = await fetch("/api/events")
      return r.status
    })
    expect(status).toBe(200)
  })
})

// ADR 008: the discover page reads D1 through /api/events. It used to render
// a hardcoded EVENTS array, so these guard the wiring, not just the fetch.
test.describe("SPA events come from the API", () => {
  test("discover fetches /api/events and renders what it returns", async ({ page }) => {
    const calls: string[] = []
    page.on("request", (r) => {
      const u = new URL(r.url())
      if (u.pathname.startsWith("/api/") || u.pathname.startsWith("/rpc")) calls.push(u.pathname)
    })

    await page.goto("/")
    await expect(page.locator(".event-row").first()).toBeVisible()
    // The SPA talks oRPC at /rpc, not REST at /api. Both are the same router:
    // /api is the documented REST surface for external clients, /rpc is the
    // typed one our own client uses. What matters here is that the page got its
    // events from the server rather than from a fixture.
    expect(calls.some((u) => u.includes("/rpc"))).toBe(true)

    // The seeded fixtures come from remy-sport-biz/data/seed/events.jsonl and
    // never existed in the old mock data, so seeing one proves the source swap.
    const titles = await page.locator(".event-row .name").allTextContents()
    expect(titles).toContain("Chiang Mai Summer Basketball Camp 2026")

    // Equally: nothing from the deleted fixture set should appear.
    expect(titles).not.toContain("Bangkok Cup 2026 — U16 Boys")
  })

})
