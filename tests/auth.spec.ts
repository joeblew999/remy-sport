import { test, expect } from "@playwright/test"

const testPassword = "testpassword123"
const testName = "Test User"

test.describe.serial("Auth flow", () => {
  const email = `auth-test-${Date.now()}@example.com`

  test("can sign up a new user", async ({ request }) => {
    const res = await request.post("/api/auth/sign-up/email", {
      data: { email, password: testPassword, name: testName },
    })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.user.email).toBe(email)
    expect(body.user.name).toBe(testName)
    expect(body.token).toBeTruthy()
  })

  test("can sign in with same credentials", async ({ request }) => {
    const res = await request.post("/api/auth/sign-in/email", {
      data: { email, password: testPassword },
    })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.user.email).toBe(email)
    expect(body.token).toBeTruthy()
  })

  test("rejects sign in with wrong password", async ({ request }) => {
    const res = await request.post("/api/auth/sign-in/email", {
      data: { email, password: "wrongpassword123" },
    })
    expect(res.ok()).toBeFalsy()
  })
})
