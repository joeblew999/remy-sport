import { test, expect } from "@playwright/test"

const ADMIN =     { email: "admin@remy.dev",     password: "admin1234!",   role: "admin" }
const ORGANIZER = { email: "organizer@remy.dev", password: "organizer1!",  role: "organizer" }
const COACH =     { email: "coach@remy.dev",     password: "coach12345!",  role: "coach" }
const PLAYER =    { email: "player@remy.dev",    password: "player1234!",  role: "player" }
const SPECTATOR = { email: "spectator@remy.dev", password: "spectator1!",  role: "spectator" }
const REFEREE =   { email: "referee@remy.dev",   password: "referee1234!", role: "referee" }

// fixture:generate — admin, organizer; everyone else read-only
const FIXTURE_GENERATORS = [ADMIN, ORGANIZER]
const FIXTURE_NO_GENERATE = [COACH, PLAYER, SPECTATOR, REFEREE]

async function signIn(request: any, user: { email: string; password: string }) {
  const res = await request.post("/api/auth/sign-in/email", { data: user })
  expect(res.ok()).toBeTruthy()
  return res
}

test.describe.serial("Fixture — generate by role", () => {
  let eventId: string

  test("seed", async ({ request }) => {
    await request.post("/api/seed")
  })

  test("organizer creates event for fixtures", async ({ request }) => {
    await signIn(request, ORGANIZER)
    const res = await request.post("/api/events", {
      data: { name: "Fixture Test Event", type: "league" },
    })
    eventId = (await res.json()).id
  })

  for (const actor of FIXTURE_GENERATORS) {
    test(`${actor.role} CAN generate fixtures`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/fixtures", {
        data: { eventId, name: `${actor.role}'s fixture` },
      })
      expect(res.status()).toBe(201)
      expect((await res.json()).name).toBe(`${actor.role}'s fixture`)
    })
  }

  for (const actor of FIXTURE_NO_GENERATE) {
    test(`${actor.role} CANNOT generate fixtures (403)`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/fixtures", {
        data: { eventId, name: "Nope" },
      })
      expect(res.status()).toBe(403)
    })
  }

  test("unauthenticated user gets 401", async ({ request }) => {
    const res = await request.post("/api/fixtures", {
      data: { eventId, name: "Unauth" },
    })
    expect(res.status()).toBe(401)
  })
})

test.describe("Fixture — read is public", () => {
  test("unauthenticated user can list fixtures", async ({ request }) => {
    const res = await request.get("/api/fixtures")
    expect(res.ok()).toBeTruthy()
  })
})
