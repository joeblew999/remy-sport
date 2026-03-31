import { test, expect } from "@playwright/test"
import { ADMIN, signIn, actorsCan, actorsCannot } from "./helpers"

const TEAM_REGS = actorsCan("registration", "register-team")
const NO_TEAM_REG = actorsCannot("registration", "register-team")

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

  for (const actor of TEAM_REGS) {
    test(`${actor.role} CAN register team`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/registrations/team", {
        data: { eventId, teamId },
      })
      expect(res.status()).toBe(201)
      expect((await res.json()).type).toBe("team")
    })
  }

  for (const actor of NO_TEAM_REG) {
    test(`${actor.role} CANNOT register team (403)`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/registrations/team", {
        data: { eventId, teamId },
      })
      expect(res.status()).toBe(403)
    })
  }

  test("GET /api/registrations returns list", async ({ request }) => {
    const res = await request.get("/api/registrations")
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.registrations.length).toBeGreaterThan(0)
  })
})
