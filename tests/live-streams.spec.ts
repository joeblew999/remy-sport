import { test, expect } from "@playwright/test"
import { ORGANIZER, signIn, authzTests } from "./helpers"

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

  authzTests("live-stream", "manage", "post", "/api/live-streams",
    (actor) => ({ eventId, title: `Stream ${actor.role}`, url: "https://example.com/live" }))

  test("GET /api/live-streams returns list", async ({ request }) => {
    const res = await request.get("/api/live-streams")
    expect(res.ok()).toBeTruthy()
    expect((await res.json()).liveStreams.length).toBeGreaterThan(0)
  })
})
