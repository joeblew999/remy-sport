import { test, expect } from "@playwright/test"
import { ADMIN, ORGANIZER, COACH, PLAYER, SPECTATOR, REFEREE, signIn } from "./helpers"

const RECORDERS   = [ADMIN, ORGANIZER, COACH]
const NO_RECORD   = [PLAYER, SPECTATOR, REFEREE]

test.describe.serial("Attendance — record by role", () => {
  let eventId: string
  let campSessionId: string
  let playerId: string

  test("seed", async ({ request }) => {
    await request.post("/api/seed")
  })

  test("admin creates camp event, session, and player", async ({ request }) => {
    await signIn(request, ADMIN)
    const evt = await request.post("/api/events", {
      data: { name: "Attendance Camp", type: "camp" },
    })
    eventId = (await evt.json()).id

    const sess = await request.post("/api/sessions", {
      data: { eventId, name: "Morning Session" },
    })
    campSessionId = (await sess.json()).id

    const pl = await request.post("/api/players", {
      data: { name: "Attendance Player", position: "Forward" },
    })
    playerId = (await pl.json()).id
  })

  for (const actor of RECORDERS) {
    test(`${actor.role} CAN record attendance`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/attendance", {
        data: { eventId, campSessionId, playerId, present: true },
      })
      expect(res.status()).toBe(201)
      expect((await res.json()).present).toBe(true)
    })
  }

  for (const actor of NO_RECORD) {
    test(`${actor.role} CANNOT record attendance (403)`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/attendance", {
        data: { eventId, campSessionId, playerId, present: false },
      })
      expect(res.status()).toBe(403)
    })
  }
})
