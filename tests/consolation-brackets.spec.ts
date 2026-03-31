import { test, expect } from "@playwright/test"
import { ORGANIZER, signIn, actorsCan, actorsCannot } from "./helpers"

const GENERATORS = actorsCan("consolation-bracket", "generate")
const NO_GEN = actorsCannot("consolation-bracket", "generate")

test.describe.serial("Consolation Bracket — generate by role", () => {
  let eventId: string

  test("seed", async ({ request }) => {
    await request.post("/api/seed")
  })

  test("organizer creates event", async ({ request }) => {
    await signIn(request, ORGANIZER)
    const res = await request.post("/api/events", {
      data: { name: "Consolation Test", type: "tournament" },
    })
    eventId = (await res.json()).id
  })

  for (const actor of GENERATORS) {
    test(`${actor.role} CAN generate consolation brackets`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/consolation-brackets", {
        data: { eventId, name: `CB ${actor.role}` },
      })
      expect(res.status()).toBe(201)
    })
  }

  for (const actor of NO_GEN) {
    test(`${actor.role} CANNOT generate consolation brackets (403)`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/consolation-brackets", {
        data: { eventId, name: "Nope" },
      })
      expect(res.status()).toBe(403)
    })
  }

  test("GET /api/consolation-brackets returns list", async ({ request }) => {
    const res = await request.get("/api/consolation-brackets")
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.consolationBrackets.length).toBeGreaterThan(0)
  })
})
