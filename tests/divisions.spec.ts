import { test, expect } from "@playwright/test"
import { ORGANIZER, signIn, actorsCan, actorsCannot } from "./helpers"

const CREATORS = actorsCan("division", "create")
const NO_CREATE = actorsCannot("division", "create")

test.describe.serial("Division — CRUD by role", () => {
  let eventId: string

  test("seed", async ({ request }) => {
    await request.post("/api/seed")
  })

  test("organizer creates event", async ({ request }) => {
    await signIn(request, ORGANIZER)
    const res = await request.post("/api/events", {
      data: { name: "Division Test Event", type: "tournament" },
    })
    eventId = (await res.json()).id
  })

  for (const actor of CREATORS) {
    test(`${actor.role} CAN create divisions`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/divisions", {
        data: { eventId, name: `Div ${actor.role}`, ageGroup: "U14", gender: "mixed" },
      })
      expect(res.status()).toBe(201)
      const body = await res.json()
      expect(body.name).toBe(`Div ${actor.role}`)
    })
  }

  for (const actor of NO_CREATE) {
    test(`${actor.role} CANNOT create divisions (403)`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/divisions", {
        data: { eventId, name: "Nope" },
      })
      expect(res.status()).toBe(403)
    })
  }

  test("GET /api/divisions returns list", async ({ request }) => {
    const res = await request.get("/api/divisions")
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.divisions.length).toBeGreaterThan(0)
  })
})
