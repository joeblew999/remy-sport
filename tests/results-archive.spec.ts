import { test, expect } from "@playwright/test"

test.describe.serial("Results Archive — public read", () => {
  test("seed", async ({ request }) => {
    await request.post("/api/seed")
  })

  test("GET /api/results-archive returns results", async ({ request }) => {
    const res = await request.get("/api/results-archive")
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body).toHaveProperty("results")
    expect(Array.isArray(body.results)).toBeTruthy()
  })
})
