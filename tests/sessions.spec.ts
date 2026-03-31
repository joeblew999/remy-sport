import { test, expect } from "@playwright/test"

const ADMIN =     { email: "admin@remy.dev",     password: "admin1234!",   role: "admin" }
const ORGANIZER = { email: "organizer@remy.dev", password: "organizer1!",  role: "organizer" }
const COACH =     { email: "coach@remy.dev",     password: "coach12345!",  role: "coach" }
const PLAYER =    { email: "player@remy.dev",    password: "player1234!",  role: "player" }
const SPECTATOR = { email: "spectator@remy.dev", password: "spectator1!",  role: "spectator" }
const REFEREE =   { email: "referee@remy.dev",   password: "referee1234!", role: "referee" }

// session:define — admin, organizer; everyone else read-only or none
const SESSION_DEFINERS = [ADMIN, ORGANIZER]
const SESSION_NO_DEFINE = [COACH, PLAYER, SPECTATOR, REFEREE]

async function signIn(request: any, user: { email: string; password: string }) {
  const res = await request.post("/api/auth/sign-in/email", { data: user })
  expect(res.ok()).toBeTruthy()
  return res
}

test.describe.serial("Camp Session — define by role", () => {
  let eventId: string

  test("seed", async ({ request }) => {
    await request.post("/api/seed")
  })

  test("organizer creates camp event for sessions", async ({ request }) => {
    await signIn(request, ORGANIZER)
    const res = await request.post("/api/events", {
      data: { name: "Camp Session Event", type: "camp" },
    })
    eventId = (await res.json()).id
  })

  for (const actor of SESSION_DEFINERS) {
    test(`${actor.role} CAN define camp sessions`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/sessions", {
        data: { eventId, name: `${actor.role}'s session` },
      })
      expect(res.status()).toBe(201)
      expect((await res.json()).name).toBe(`${actor.role}'s session`)
    })
  }

  for (const actor of SESSION_NO_DEFINE) {
    test(`${actor.role} CANNOT define camp sessions (403)`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/sessions", {
        data: { eventId, name: "Nope" },
      })
      expect(res.status()).toBe(403)
    })
  }

  test("unauthenticated user gets 401", async ({ request }) => {
    const res = await request.post("/api/sessions", {
      data: { eventId, name: "Unauth" },
    })
    expect(res.status()).toBe(401)
  })
})

test.describe("Camp Session — read is public", () => {
  test("unauthenticated user can list sessions", async ({ request }) => {
    const res = await request.get("/api/sessions")
    expect(res.ok()).toBeTruthy()
  })
})
