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

  // The SPA was served but unreachable: no server-rendered page linked to it,
  // so /app existed only for anyone who knew to type it.
  test("the home page links to the SPA", async ({ page }) => {
    await page.goto("/")
    await expect(page.locator('a[href="/app"]')).toBeVisible()
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

// ADR 008: the discover page reads D1 through /api/events. It used to render
// a hardcoded EVENTS array, so these guard the wiring, not just the fetch.
test.describe("SPA events come from the API", () => {
  test("discover fetches /api/events and renders what it returns", async ({ page }) => {
    const calls: string[] = []
    page.on("request", (r) => {
      const u = new URL(r.url())
      if (u.pathname.startsWith("/api/")) calls.push(u.pathname)
    })

    await page.goto("/app")
    await expect(page.locator(".event-row").first()).toBeVisible()
    expect(calls).toContain("/api/events")

    // The seeded fixtures come from remy-sport-biz/data/seed/events.jsonl and
    // never existed in the old mock data, so seeing one proves the source swap.
    const titles = await page.locator(".event-row .name").allTextContents()
    expect(titles).toContain("Chiang Mai Summer Basketball Camp 2026")

    // Equally: nothing from the deleted fixture set should appear.
    expect(titles).not.toContain("Bangkok Cup 2026 — U16 Boys")
  })

  test("status and date are derived from the stored date window", async ({ page }) => {
    await page.goto("/app")
    const row = page.locator(".event-row", {
      hasText: "Chiang Mai Summer Basketball Camp 2026",
    })
    await expect(row).toBeVisible()
    // Seeded 2026-04-15 → 2026-04-19. No status column exists in D1; the SPA
    // computes it, so an event whose window has passed must read as finished.
    await expect(row.locator(".date .day")).toHaveText("15")
    await expect(row.locator(".date .mo")).toHaveText("APR")
    await expect(row.locator(".status")).toHaveText("Finished")
  })

  test("an event deep-link loads that event from the API", async ({ page }) => {
    await page.goto("/app#/event/evt_002")
    await expect(page.locator(".event-hero")).toContainText(
      "Bangkok Schools Basketball League 2026",
    )
  })

  test("a deep-link to a missing event says so instead of showing another one", async ({ page }) => {
    await page.goto("/app#/event/evt_does_not_exist")
    await expect(page.locator(".empty")).toContainText("does not exist")
  })
})
