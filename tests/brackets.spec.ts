import { test, expect } from "@playwright/test"

const ADMIN =     { email: "admin@remy.dev",     password: "admin1234!",   role: "admin" }
const ORGANIZER = { email: "organizer@remy.dev", password: "organizer1!",  role: "organizer" }
const COACH =     { email: "coach@remy.dev",     password: "coach12345!",  role: "coach" }
const PLAYER =    { email: "player@remy.dev",    password: "player1234!",  role: "player" }
const SPECTATOR = { email: "spectator@remy.dev", password: "spectator1!",  role: "spectator" }
const REFEREE =   { email: "referee@remy.dev",   password: "referee1234!", role: "referee" }

// bracket:generate — admin, organizer; everyone else read-only
const BRACKET_GENERATORS = [ADMIN, ORGANIZER]
const BRACKET_NO_GENERATE = [COACH, PLAYER, SPECTATOR, REFEREE]

async function signIn(request: any, user: { email: string; password: string }) {
  const res = await request.post("/api/auth/sign-in/email", { data: user })
  expect(res.ok()).toBeTruthy()
  return res
}

test.describe.serial("Bracket — generate by role", () => {
  let eventId: string

  test("seed", async ({ request }) => {
    await request.post("/api/seed")
  })

  test("organizer creates event for brackets", async ({ request }) => {
    await signIn(request, ORGANIZER)
    const res = await request.post("/api/events", {
      data: { name: "Bracket Test Event", type: "tournament" },
    })
    eventId = (await res.json()).id
  })

  for (const actor of BRACKET_GENERATORS) {
    test(`${actor.role} CAN generate brackets`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/brackets", {
        data: { eventId, name: `${actor.role}'s bracket` },
      })
      expect(res.status()).toBe(201)
      expect((await res.json()).name).toBe(`${actor.role}'s bracket`)
    })
  }

  for (const actor of BRACKET_NO_GENERATE) {
    test(`${actor.role} CANNOT generate brackets (403)`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/brackets", {
        data: { eventId, name: "Nope" },
      })
      expect(res.status()).toBe(403)
    })
  }

  test("unauthenticated user gets 401", async ({ request }) => {
    const res = await request.post("/api/brackets", {
      data: { eventId, name: "Unauth" },
    })
    expect(res.status()).toBe(401)
  })
})

test.describe("Bracket — read is public", () => {
  test("unauthenticated user can list brackets", async ({ request }) => {
    const res = await request.get("/api/brackets")
    expect(res.ok()).toBeTruthy()
  })
})
