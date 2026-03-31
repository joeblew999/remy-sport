import { test, expect } from "@playwright/test"

const ADMIN =     { email: "admin@remy.dev",     password: "admin1234!",   role: "admin" }
const ORGANIZER = { email: "organizer@remy.dev", password: "organizer1!",  role: "organizer" }
const COACH =     { email: "coach@remy.dev",     password: "coach12345!",  role: "coach" }
const PLAYER =    { email: "player@remy.dev",    password: "player1234!",  role: "player" }
const SPECTATOR = { email: "spectator@remy.dev", password: "spectator1!",  role: "spectator" }
const REFEREE =   { email: "referee@remy.dev",   password: "referee1234!", role: "referee" }

// Match status: O, R, A can update (score:enter permission); C, P, S cannot
const STATUS_UPDATERS = [ADMIN, ORGANIZER, REFEREE]
const STATUS_NO_UPDATE = [COACH, PLAYER, SPECTATOR]

async function signIn(request: any, user: { email: string; password: string }) {
  const res = await request.post("/api/auth/sign-in/email", { data: user })
  expect(res.ok()).toBeTruthy()
  return res
}

test.describe.serial("Match — status update by role", () => {
  let matchId: string

  test("seed + create match", async ({ request }) => {
    await request.post("/api/seed")
    await signIn(request, ORGANIZER)
    const evt = await request.post("/api/events", {
      data: { name: "Match Status Event", type: "tournament" },
    })
    const eventId = (await evt.json()).id
    const m = await request.post("/api/matches", { data: { eventId } })
    matchId = (await m.json()).id
  })

  for (const actor of STATUS_UPDATERS) {
    test(`${actor.role} CAN update match status`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.put(`/api/matches/${matchId}/status`, {
        data: { status: "in_progress" },
      })
      expect(res.status()).toBe(200)
      expect((await res.json()).status).toBe("in_progress")
    })
  }

  for (const actor of STATUS_NO_UPDATE) {
    test(`${actor.role} CANNOT update match status (403)`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.put(`/api/matches/${matchId}/status`, {
        data: { status: "completed" },
      })
      expect(res.status()).toBe(403)
    })
  }

  test("unauthenticated user gets 401", async ({ request }) => {
    const res = await request.put(`/api/matches/${matchId}/status`, {
      data: { status: "completed" },
    })
    expect(res.status()).toBe(401)
  })
})

test.describe("Match — read is public", () => {
  test("unauthenticated user can list matches", async ({ request }) => {
    const res = await request.get("/api/matches")
    expect(res.ok()).toBeTruthy()
  })

  test("unauthenticated user can get single match", async ({ request }) => {
    const list = await request.get("/api/matches")
    const { matches } = await list.json()
    if (matches.length > 0) {
      const res = await request.get(`/api/matches/${matches[0].id}`)
      expect(res.ok()).toBeTruthy()
    }
  })
})
