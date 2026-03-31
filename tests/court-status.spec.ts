import { test, expect } from "@playwright/test"

test.describe.serial("Court Status — public read", () => {
  test("seed", async ({ request }) => {
    await request.post("/api/seed")
  })

  test("GET /api/court-status returns courts", async ({ request }) => {
    const res = await request.get("/api/court-status")
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body).toHaveProperty("courts")
    expect(Array.isArray(body.courts)).toBeTruthy()
  })
})
