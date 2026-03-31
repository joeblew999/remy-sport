import { test, expect } from "@playwright/test"
import { ORGANIZER, signIn, actorsCan, actorsCannot } from "./helpers"

const ASSIGNERS  = actorsCan("court", "assign")
const NO_ASSIGN  = actorsCannot("court", "assign")

test.describe.serial("Court — assign by role", () => {
  let eventId: string

  test("seed", async ({ request }) => {
    await request.post("/api/seed")
  })

  test("organizer creates event for courts", async ({ request }) => {
    await signIn(request, ORGANIZER)
    const res = await request.post("/api/events", {
      data: { name: "Court Test Event", type: "tournament" },
    })
    eventId = (await res.json()).id
  })

  for (const actor of ASSIGNERS) {
    test(`${actor.role} CAN assign courts`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/courts", {
        data: { name: `Court ${actor.role}`, eventId },
      })
      expect(res.status()).toBe(201)
      expect((await res.json()).name).toBe(`Court ${actor.role}`)
    })
  }

  for (const actor of NO_ASSIGN) {
    test(`${actor.role} CANNOT assign courts (403)`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/courts", {
        data: { name: "Nope", eventId },
      })
      expect(res.status()).toBe(403)
    })
  }
})
