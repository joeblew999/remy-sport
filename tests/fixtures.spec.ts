import { test, expect } from "@playwright/test"
import { ORGANIZER, signIn, actorsCan, actorsCannot } from "./helpers"

const GENERATORS  = actorsCan("fixture", "generate")
const NO_GENERATE = actorsCannot("fixture", "generate")

test.describe.serial("Fixture — generate by role", () => {
  let eventId: string

  test("seed", async ({ request }) => {
    await request.post("/api/seed")
  })

  test("organizer creates event for fixtures", async ({ request }) => {
    await signIn(request, ORGANIZER)
    const res = await request.post("/api/events", {
      data: { name: "Fixture Test Event", type: "league" },
    })
    eventId = (await res.json()).id
  })

  for (const actor of GENERATORS) {
    test(`${actor.role} CAN generate fixtures`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/fixtures", {
        data: { eventId, name: `${actor.role}'s fixture` },
      })
      expect(res.status()).toBe(201)
      expect((await res.json()).name).toBe(`${actor.role}'s fixture`)
    })
  }

  for (const actor of NO_GENERATE) {
    test(`${actor.role} CANNOT generate fixtures (403)`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/fixtures", {
        data: { eventId, name: "Nope" },
      })
      expect(res.status()).toBe(403)
    })
  }
})
