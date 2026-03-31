import { test, expect } from "@playwright/test"
import { ORGANIZER, signIn, authzTests } from "./helpers"

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

  authzTests("consolation-bracket", "generate", "post", "/api/consolation-brackets",
    (actor) => ({ eventId, name: `CB ${actor.role}` }))

  test("GET /api/consolation-brackets returns list", async ({ request }) => {
    const res = await request.get("/api/consolation-brackets")
    expect(res.ok()).toBeTruthy()
    expect((await res.json()).consolationBrackets.length).toBeGreaterThan(0)
  })
})
