import { test, expect } from "@playwright/test"

const ADMIN =     { email: "admin@remy.dev",     password: "admin1234!",   role: "admin" }
const ORGANIZER = { email: "organizer@remy.dev", password: "organizer1!",  role: "organizer" }
const COACH =     { email: "coach@remy.dev",     password: "coach12345!",  role: "coach" }
const PLAYER =    { email: "player@remy.dev",    password: "player1234!",  role: "player" }
const SPECTATOR = { email: "spectator@remy.dev", password: "spectator1!",  role: "spectator" }
const REFEREE =   { email: "referee@remy.dev",   password: "referee1234!", role: "referee" }

// court:assign — admin, organizer; referee can read only; others no access
const COURT_ASSIGNERS = [ADMIN, ORGANIZER]
const COURT_NO_ASSIGN = [COACH, PLAYER, SPECTATOR, REFEREE]

async function signIn(request: any, user: { email: string; password: string }) {
  const res = await request.post("/api/auth/sign-in/email", { data: user })
  expect(res.ok()).toBeTruthy()
  return res
}

test.describe.serial("Court — assign by role", () => {
  let eventId: string

  test("seed", async ({ request }) => {
    await request.post("/api/seed")
  })

  test("organizer creates event for courts", async ({ request }) => {
    await signIn(request, ORGANIZER)
    const res = await request.post("/api/events", {
      data: { name: "Court Test Event", type: "tournament" },
    })
    eventId = (await res.json()).id
  })

  for (const actor of COURT_ASSIGNERS) {
    test(`${actor.role} CAN assign courts`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/courts", {
        data: { name: `Court ${actor.role}`, eventId },
      })
      expect(res.status()).toBe(201)
      expect((await res.json()).name).toBe(`Court ${actor.role}`)
    })
  }

  for (const actor of COURT_NO_ASSIGN) {
    test(`${actor.role} CANNOT assign courts (403)`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/courts", {
        data: { name: "Nope", eventId },
      })
      expect(res.status()).toBe(403)
    })
  }

  test("unauthenticated user gets 401", async ({ request }) => {
    const res = await request.post("/api/courts", {
      data: { name: "Unauth", eventId },
    })
    expect(res.status()).toBe(401)
  })
})

test.describe("Court — read is public", () => {
  test("unauthenticated user can list courts", async ({ request }) => {
    const res = await request.get("/api/courts")
    expect(res.ok()).toBeTruthy()
  })
})
