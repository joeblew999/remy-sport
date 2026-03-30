import { test, expect } from "@playwright/test"

// Seed users (see ADR 002 / CONTEXT.md)
const ADMIN = { email: "admin@remy.dev", password: "admin1234!", name: "Admin" }
const USER = { email: "user@remy.dev", password: "user12345!", name: "User" }

test.describe.serial("Auth flow", () => {
  test("seed endpoint creates dev users (idempotent)", async ({ request }) => {
    const res = await request.post("/api/seed")
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.seeded.length).toBeGreaterThanOrEqual(2)
    for (const u of body.seeded) {
      expect(["created", "exists"]).toContain(u.status)
    }
  })

  test("admin can sign in", async ({ request }) => {
    const res = await request.post("/api/auth/sign-in/email", {
      data: { email: ADMIN.email, password: ADMIN.password },
    })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.user.email).toBe(ADMIN.email)
    expect(body.user.name).toBe(ADMIN.name)
    expect(body.token).toBeTruthy()
  })

  test("user can sign in", async ({ request }) => {
    const res = await request.post("/api/auth/sign-in/email", {
      data: { email: USER.email, password: USER.password },
    })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.user.email).toBe(USER.email)
    expect(body.user.name).toBe(USER.name)
    expect(body.token).toBeTruthy()
  })

  test("rejects sign in with wrong password", async ({ request }) => {
    const res = await request.post("/api/auth/sign-in/email", {
      data: { email: ADMIN.email, password: "wrongpassword123" },
    })
    expect(res.ok()).toBeFalsy()
  })
})
