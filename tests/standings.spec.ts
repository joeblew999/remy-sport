import { test, expect } from "@playwright/test"

test.describe.serial("Standings — public read", () => {
  test("seed", async ({ request }) => {
    await request.post("/api/seed")
  })

  test("GET /api/standings returns standings", async ({ request }) => {
    const res = await request.get("/api/standings")
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body).toHaveProperty("standings")
    expect(Array.isArray(body.standings)).toBeTruthy()
  })
})
