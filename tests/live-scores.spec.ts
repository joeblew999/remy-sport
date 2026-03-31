import { test, expect } from "@playwright/test"

test.describe.serial("Live Scores — public read", () => {
  test("seed", async ({ request }) => {
    await request.post("/api/seed")
  })

  test("GET /api/live-scores returns live scores", async ({ request }) => {
    const res = await request.get("/api/live-scores")
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body).toHaveProperty("liveScores")
    expect(Array.isArray(body.liveScores)).toBeTruthy()
  })
})
