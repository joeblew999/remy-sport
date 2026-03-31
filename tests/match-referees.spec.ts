import { test, expect } from "@playwright/test"
import { ADMIN, ORGANIZER, COACH, PLAYER, SPECTATOR, REFEREE, signIn } from "./helpers"

const ASSIGNERS   = [ADMIN, ORGANIZER]
const NO_ASSIGN   = [COACH, PLAYER, SPECTATOR, REFEREE]

test.describe.serial("Match Referee — assign by role", () => {
  let matchId: string
  let refereeUserId: string

  test("seed", async ({ request }) => {
    await request.post("/api/seed")
  })

  test("organizer creates event and match", async ({ request }) => {
    await signIn(request, ORGANIZER)
    const evt = await request.post("/api/events", {
      data: { name: "Referee Assignment Event", type: "tournament" },
    })
    const eventId = (await evt.json()).id
    const m = await request.post("/api/matches", { data: { eventId } })
    matchId = (await m.json()).id
  })

  test("get referee user ID", async ({ request }) => {
    const refRes = await request.post("/api/auth/sign-in/email", {
      data: { email: REFEREE.email, password: REFEREE.password },
    })
    refereeUserId = (await refRes.json()).user.id
  })

  for (const actor of ASSIGNERS) {
    test(`${actor.role} CAN assign referees`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/match-referees", {
        data: { matchId, userId: refereeUserId },
      })
      expect(res.status()).toBe(201)
      expect((await res.json()).matchId).toBe(matchId)
    })
  }

  for (const actor of NO_ASSIGN) {
    test(`${actor.role} CANNOT assign referees (403)`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/match-referees", {
        data: { matchId, userId: refereeUserId },
      })
      expect(res.status()).toBe(403)
    })
  }
})
