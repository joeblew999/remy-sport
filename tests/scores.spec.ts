import { test, expect } from "@playwright/test"
import { ADMIN, ORGANIZER, COACH, PLAYER, SPECTATOR, REFEREE, signIn } from "./helpers"

const ENTERERS    = [ADMIN, ORGANIZER, REFEREE]
const NO_ENTER    = [COACH, PLAYER, SPECTATOR]

test.describe.serial("Score — enter by role", () => {
  let matchId: string

  test("seed", async ({ request }) => {
    await request.post("/api/seed")
  })

  test("organizer creates event and match", async ({ request }) => {
    await signIn(request, ORGANIZER)
    const evt = await request.post("/api/events", {
      data: { name: "Score Test Event", type: "tournament" },
    })
    const eventId = (await evt.json()).id
    const m = await request.post("/api/matches", { data: { eventId } })
    expect(m.status()).toBe(201)
    matchId = (await m.json()).id
  })

  for (const actor of ENTERERS) {
    test(`${actor.role} CAN enter scores`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/scores", {
        data: { matchId, homeScore: 3, awayScore: 1 },
      })
      expect(res.status()).toBe(201)
      const body = await res.json()
      expect(body.homeScore).toBe(3)
      expect(body.awayScore).toBe(1)
    })
  }

  for (const actor of NO_ENTER) {
    test(`${actor.role} CANNOT enter scores (403)`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/scores", {
        data: { matchId, homeScore: 0, awayScore: 0 },
      })
      expect(res.status()).toBe(403)
    })
  }
})
