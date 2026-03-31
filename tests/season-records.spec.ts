import { test, expect } from "@playwright/test"

test.describe.serial("Season Records — public read", () => {
  test("seed", async ({ request }) => {
    await request.post("/api/seed")
  })

  test("GET /api/season-records returns records", async ({ request }) => {
    const res = await request.get("/api/season-records")
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body).toHaveProperty("records")
    expect(Array.isArray(body.records)).toBeTruthy()
  })
})
