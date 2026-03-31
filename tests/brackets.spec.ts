import { test, expect } from "@playwright/test"
import { ORGANIZER, signIn, actorsCan, actorsCannot } from "./helpers"

const GENERATORS  = actorsCan("bracket", "generate")
const NO_GENERATE = actorsCannot("bracket", "generate")

test.describe.serial("Bracket — generate by role", () => {
  let eventId: string

  test("seed", async ({ request }) => {
    await request.post("/api/seed")
  })

  test("organizer creates event for brackets", async ({ request }) => {
    await signIn(request, ORGANIZER)
    const res = await request.post("/api/events", {
      data: { name: "Bracket Test Event", type: "tournament" },
    })
    eventId = (await res.json()).id
  })

  for (const actor of GENERATORS) {
    test(`${actor.role} CAN generate brackets`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/brackets", {
        data: { eventId, name: `${actor.role}'s bracket` },
      })
      expect(res.status()).toBe(201)
      expect((await res.json()).name).toBe(`${actor.role}'s bracket`)
    })
  }

  for (const actor of NO_GENERATE) {
    test(`${actor.role} CANNOT generate brackets (403)`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/brackets", {
        data: { eventId, name: "Nope" },
      })
      expect(res.status()).toBe(403)
    })
  }
})
