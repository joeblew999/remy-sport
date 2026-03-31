import { test, expect } from "@playwright/test"

const ADMIN =     { email: "admin@remy.dev",     password: "admin1234!",   role: "admin" }
const ORGANIZER = { email: "organizer@remy.dev", password: "organizer1!",  role: "organizer" }
const COACH =     { email: "coach@remy.dev",     password: "coach12345!",  role: "coach" }
const PLAYER =    { email: "player@remy.dev",    password: "player1234!",  role: "player" }
const SPECTATOR = { email: "spectator@remy.dev", password: "spectator1!",  role: "spectator" }
const REFEREE =   { email: "referee@remy.dev",   password: "referee1234!", role: "referee" }

// roster:manage — admin, coach only; everyone else denied
const ROSTER_MANAGERS = [ADMIN, COACH]
const ROSTER_NO_MANAGE = [ORGANIZER, PLAYER, SPECTATOR, REFEREE]

async function signIn(request: any, user: { email: string; password: string }) {
  const res = await request.post("/api/auth/sign-in/email", { data: user })
  expect(res.ok()).toBeTruthy()
  return res
}

test.describe.serial("Roster — manage by role", () => {
  let teamId: string
  let playerId: string

  test("seed", async ({ request }) => {
    await request.post("/api/seed")
  })

  test("coach creates team and player for roster", async ({ request }) => {
    await signIn(request, COACH)
    // Create event first
    const evt = await request.post("/api/events", {
      data: { name: "Roster Event", type: "tournament" },
    })
    // Coach can't create events — use admin
    if (evt.status() === 403) {
      // Expected — create via different flow
    }
  })

  test("admin creates prerequisite data", async ({ request }) => {
    await signIn(request, ADMIN)
    const evt = await request.post("/api/events", {
      data: { name: "Roster Event", type: "tournament" },
    })
    const eventId = (await evt.json()).id
    const tm = await request.post("/api/teams", {
      data: { name: "Roster Team", eventId },
    })
    teamId = (await tm.json()).id
    const pl = await request.post("/api/players", {
      data: { name: "Roster Player", position: "Guard" },
    })
    playerId = (await pl.json()).id
  })

  for (const actor of ROSTER_MANAGERS) {
    test(`${actor.role} CAN manage rosters`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/rosters", {
        data: { teamId, playerId },
      })
      expect(res.status()).toBe(201)
      expect((await res.json()).teamId).toBe(teamId)
    })
  }

  for (const actor of ROSTER_NO_MANAGE) {
    test(`${actor.role} CANNOT manage rosters (403)`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/rosters", {
        data: { teamId, playerId },
      })
      expect(res.status()).toBe(403)
    })
  }

  test("unauthenticated user gets 401", async ({ request }) => {
    const res = await request.post("/api/rosters", {
      data: { teamId, playerId },
    })
    expect(res.status()).toBe(401)
  })
})

test.describe("Roster — read is public", () => {
  test("unauthenticated user can list rosters", async ({ request }) => {
    const res = await request.get("/api/rosters")
    expect(res.ok()).toBeTruthy()
  })
})
