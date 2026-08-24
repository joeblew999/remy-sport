import { test, expect } from "@playwright/test"
import { signIn, ADMIN, SPECTATOR } from "./helpers/auth"

// Passwordless sign-in (ADR 012). The seeded actors have no passwords at all
// now — an address that can receive a code is the whole credential.

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

  test("admin can sign in with an emailed code", async ({ request }) => {
    await signIn(request, ADMIN)
    const session = await (await request.get("/api/auth/get-session")).json()
    expect(session.user.email).toBe(ADMIN)
    expect(session.user.name).toBe("Admin")
    expect(session.session.token).toBeTruthy()
  })

  test("spectator can sign in with an emailed code", async ({ request }) => {
    await signIn(request, SPECTATOR)
    const session = await (await request.get("/api/auth/get-session")).json()
    expect(session.user.email).toBe(SPECTATOR)
    expect(session.user.name).toBe("Spectator")
  })

  test("a wrong code is rejected", async ({ request, baseURL }) => {
    // Replaces "rejects sign in with wrong password". Same intent — a bad
    // credential must not authenticate — against the mechanism that now exists.
    const sent = await request.post("/api/auth/email-otp/send-verification-otp", {
      data: { email: ADMIN, type: "sign-in" },
      headers: { Origin: baseURL! },
    })
    expect(sent.ok()).toBeTruthy()

    const res = await request.post("/api/auth/sign-in/email-otp", {
      data: { email: ADMIN, otp: "000000" },
      headers: { Origin: baseURL! },
    })
    expect(res.ok()).toBeFalsy()
  })

  test("password sign-in no longer exists", async ({ request }) => {
    // The point of ADR 012: not "passwords are discouraged" but "there is no
    // password path". If this ever passes again, a second way in has returned.
    const res = await request.post("/api/auth/sign-in/email", {
      data: { email: ADMIN, password: "admin1234!" },
    })
    expect(res.ok()).toBeFalsy()
  })
})
