import { test, expect } from "@playwright/test"
import { ADMIN, ORGANIZER, COACH, PLAYER, SPECTATOR, REFEREE, signIn } from "./helpers"

const DEFINERS    = [ADMIN, ORGANIZER]
const NO_DEFINE   = [COACH, PLAYER, SPECTATOR, REFEREE]

test.describe.serial("Camp Session — define by role", () => {
  let eventId: string

  test("seed", async ({ request }) => {
    await request.post("/api/seed")
  })

  test("organizer creates camp event for sessions", async ({ request }) => {
    await signIn(request, ORGANIZER)
    const res = await request.post("/api/events", {
      data: { name: "Camp Session Event", type: "camp" },
    })
    eventId = (await res.json()).id
  })

  for (const actor of DEFINERS) {
    test(`${actor.role} CAN define camp sessions`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/sessions", {
        data: { eventId, name: `${actor.role}'s session` },
      })
      expect(res.status()).toBe(201)
      expect((await res.json()).name).toBe(`${actor.role}'s session`)
    })
  }

  for (const actor of NO_DEFINE) {
    test(`${actor.role} CANNOT define camp sessions (403)`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/sessions", {
        data: { eventId, name: "Nope" },
      })
      expect(res.status()).toBe(403)
    })
  }
})
