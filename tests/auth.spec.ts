import { test, expect } from "@playwright/test"
import { ADMIN, SPECTATOR } from "./helpers"

test.describe.serial("Auth flow", () => {
  test("seed endpoint creates dev users (idempotent)", async ({ request }) => {
    const res = await request.post("/api/seed")
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.seeded).toHaveLength(6)
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
    expect(body.token).toBeTruthy()
  })

  test("spectator can sign in", async ({ request }) => {
    const res = await request.post("/api/auth/sign-in/email", {
      data: { email: SPECTATOR.email, password: SPECTATOR.password },
    })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.user.email).toBe(SPECTATOR.email)
    expect(body.token).toBeTruthy()
  })

  test("rejects sign in with wrong password", async ({ request }) => {
    const res = await request.post("/api/auth/sign-in/email", {
      data: { email: ADMIN.email, password: "wrongpassword123" },
    })
    expect(res.ok()).toBeFalsy()
  })
})
