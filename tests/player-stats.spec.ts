import { test, expect } from "@playwright/test"

test.describe.serial("Player Stats — public read", () => {
  test("seed", async ({ request }) => {
    await request.post("/api/seed")
  })

  test("GET /api/player-stats returns stats", async ({ request }) => {
    const res = await request.get("/api/player-stats")
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body).toHaveProperty("stats")
    expect(Array.isArray(body.stats)).toBeTruthy()
  })
})
