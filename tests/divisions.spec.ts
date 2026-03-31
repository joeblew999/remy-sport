import { test, expect } from "@playwright/test"
import { ORGANIZER, signIn, authzTests } from "./helpers"

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

  authzTests("division", "create", "post", "/api/divisions",
    (actor) => ({ eventId, name: `Div ${actor.role}`, ageGroup: "U14", gender: "mixed" }),
    { check: (body, actor) => expect(body.name).toBe(`Div ${actor.role}`) })

  test("GET /api/divisions returns list", async ({ request }) => {
    const res = await request.get("/api/divisions")
    expect(res.ok()).toBeTruthy()
    expect((await res.json()).divisions.length).toBeGreaterThan(0)
  })
})
