import { test, expect } from "@playwright/test"
import { ORGANIZER, signIn, actorsCan, actorsCannot } from "./helpers"

const MANAGERS = actorsCan("live-stream", "manage")
const NO_MANAGE = actorsCannot("live-stream", "manage")

test.describe.serial("Live Stream — manage by role", () => {
  let eventId: string

  test("seed", async ({ request }) => {
    await request.post("/api/seed")
  })

  test("organizer creates event", async ({ request }) => {
    await signIn(request, ORGANIZER)
    const res = await request.post("/api/events", {
      data: { name: "Stream Test Event", type: "tournament" },
    })
    eventId = (await res.json()).id
  })

  for (const actor of MANAGERS) {
    test(`${actor.role} CAN manage live streams`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/live-streams", {
        data: { eventId, title: `Stream ${actor.role}`, url: "https://example.com/live" },
      })
      expect(res.status()).toBe(201)
    })
  }

  for (const actor of NO_MANAGE) {
    test(`${actor.role} CANNOT manage live streams (403)`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/live-streams", {
        data: { eventId, title: "Nope", url: "https://example.com/live" },
      })
      expect(res.status()).toBe(403)
    })
  }

  test("GET /api/live-streams returns list", async ({ request }) => {
    const res = await request.get("/api/live-streams")
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.liveStreams.length).toBeGreaterThan(0)
  })
})
