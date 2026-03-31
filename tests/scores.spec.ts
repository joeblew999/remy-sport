import { test, expect } from "@playwright/test"

const ADMIN =     { email: "admin@remy.dev",     password: "admin1234!",   role: "admin" }
const ORGANIZER = { email: "organizer@remy.dev", password: "organizer1!",  role: "organizer" }
const COACH =     { email: "coach@remy.dev",     password: "coach12345!",  role: "coach" }
const PLAYER =    { email: "player@remy.dev",    password: "player1234!",  role: "player" }
const SPECTATOR = { email: "spectator@remy.dev", password: "spectator1!",  role: "spectator" }
const REFEREE =   { email: "referee@remy.dev",   password: "referee1234!", role: "referee" }

// score:enter — admin, organizer, referee can enter; coach, player, spectator cannot
const SCORE_ENTERERS = [ADMIN, ORGANIZER, REFEREE]
const SCORE_NO_ENTER = [COACH, PLAYER, SPECTATOR]

async function signIn(request: any, user: { email: string; password: string }) {
  const res = await request.post("/api/auth/sign-in/email", { data: user })
  expect(res.ok()).toBeTruthy()
  return res
}

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

    const m = await request.post("/api/matches", {
      data: { eventId },
    })
    expect(m.status()).toBe(201)
    matchId = (await m.json()).id
  })

  for (const actor of SCORE_ENTERERS) {
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

  for (const actor of SCORE_NO_ENTER) {
    test(`${actor.role} CANNOT enter scores (403)`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/scores", {
        data: { matchId, homeScore: 0, awayScore: 0 },
      })
      expect(res.status()).toBe(403)
    })
  }

  test("unauthenticated user gets 401", async ({ request }) => {
    const res = await request.post("/api/scores", {
      data: { matchId, homeScore: 0, awayScore: 0 },
    })
    expect(res.status()).toBe(401)
  })
})

test.describe("Score — read is public", () => {
  test("unauthenticated user can list scores", async ({ request }) => {
    const res = await request.get("/api/scores")
    expect(res.ok()).toBeTruthy()
  })
})
