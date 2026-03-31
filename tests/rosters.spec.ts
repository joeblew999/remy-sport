import { test, expect } from "@playwright/test"
import { ADMIN, signIn, actorsCan, actorsCannot } from "./helpers"

const MANAGERS   = actorsCan("roster", "manage")
const NO_MANAGE  = actorsCannot("roster", "manage")

test.describe.serial("Roster — manage by role", () => {
  let teamId: string
  let playerId: string

  test("seed", async ({ request }) => {
    await request.post("/api/seed")
  })

  test("admin creates prerequisite data", async ({ request }) => {
    await signIn(request, ADMIN)
    const evt = await request.post("/api/events", {
      data: { name: "Roster Event", type: "tournament" },
    })
    const eventId = (await evt.json()).id
    const tm = await request.post("/api/teams", {
      data: { name: "Roster Team", eventId },
    })
    teamId = (await tm.json()).id
    const pl = await request.post("/api/players", {
      data: { name: "Roster Player", position: "Guard" },
    })
    playerId = (await pl.json()).id
  })

  for (const actor of MANAGERS) {
    test(`${actor.role} CAN manage rosters`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/rosters", {
        data: { teamId, playerId },
      })
      expect(res.status()).toBe(201)
      expect((await res.json()).teamId).toBe(teamId)
    })
  }

  for (const actor of NO_MANAGE) {
    test(`${actor.role} CANNOT manage rosters (403)`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/rosters", {
        data: { teamId, playerId },
      })
      expect(res.status()).toBe(403)
    })
  }
})
