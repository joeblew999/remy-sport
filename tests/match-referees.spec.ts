import { test, expect } from "@playwright/test"

const ADMIN =     { email: "admin@remy.dev",     password: "admin1234!",   role: "admin" }
const ORGANIZER = { email: "organizer@remy.dev", password: "organizer1!",  role: "organizer" }
const COACH =     { email: "coach@remy.dev",     password: "coach12345!",  role: "coach" }
const PLAYER =    { email: "player@remy.dev",    password: "player1234!",  role: "player" }
const SPECTATOR = { email: "spectator@remy.dev", password: "spectator1!",  role: "spectator" }
const REFEREE =   { email: "referee@remy.dev",   password: "referee1234!", role: "referee" }

// Referee assignment: O, A can assign; C, P, S, R cannot
const ASSIGNERS = [ADMIN, ORGANIZER]
const NO_ASSIGN = [COACH, PLAYER, SPECTATOR, REFEREE]

async function signIn(request: any, user: { email: string; password: string }) {
  const res = await request.post("/api/auth/sign-in/email", { data: user })
  expect(res.ok()).toBeTruthy()
  return res
}

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

  test("unauthenticated user gets 401", async ({ request }) => {
    const res = await request.post("/api/match-referees", {
      data: { matchId, userId: refereeUserId },
    })
    expect(res.status()).toBe(401)
  })
})

test.describe("Match Referee — read is public", () => {
  test("unauthenticated user can list referee assignments", async ({ request }) => {
    const res = await request.get("/api/match-referees")
    expect(res.ok()).toBeTruthy()
  })
})
