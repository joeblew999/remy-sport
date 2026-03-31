import { test, expect } from "@playwright/test"
import { ADMIN, signIn, authzTests } from "./helpers"

test.describe.serial("Registration — register-team by role", () => {
  let eventId: string
  let teamId: string

  test("seed", async ({ request }) => {
    await request.post("/api/seed")
  })

  test("admin creates prerequisite data", async ({ request }) => {
    await signIn(request, ADMIN)
    const evt = await request.post("/api/events", {
      data: { name: "Reg Test Event", type: "tournament" },
    })
    eventId = (await evt.json()).id
    const tm = await request.post("/api/teams", {
      data: { name: "Reg Team", eventId },
    })
    teamId = (await tm.json()).id
  })

  authzTests("registration", "register-team", "post", "/api/registrations/team",
    () => ({ eventId, teamId }),
    { check: (body) => expect(body.type).toBe("team") })

  test("GET /api/registrations returns list", async ({ request }) => {
    const res = await request.get("/api/registrations")
    expect(res.ok()).toBeTruthy()
    expect((await res.json()).registrations.length).toBeGreaterThan(0)
  })
})
