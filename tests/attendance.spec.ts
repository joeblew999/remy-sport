import { test, expect } from "@playwright/test"

const ADMIN =     { email: "admin@remy.dev",     password: "admin1234!",   role: "admin" }
const ORGANIZER = { email: "organizer@remy.dev", password: "organizer1!",  role: "organizer" }
const COACH =     { email: "coach@remy.dev",     password: "coach12345!",  role: "coach" }
const PLAYER =    { email: "player@remy.dev",    password: "player1234!",  role: "player" }
const SPECTATOR = { email: "spectator@remy.dev", password: "spectator1!",  role: "spectator" }
const REFEREE =   { email: "referee@remy.dev",   password: "referee1234!", role: "referee" }

// attendance:record — admin, organizer, coach; player/spectator/referee cannot
const ATTENDANCE_RECORDERS = [ADMIN, ORGANIZER, COACH]
const ATTENDANCE_NO_RECORD = [PLAYER, SPECTATOR, REFEREE]

async function signIn(request: any, user: { email: string; password: string }) {
  const res = await request.post("/api/auth/sign-in/email", { data: user })
  expect(res.ok()).toBeTruthy()
  return res
}

test.describe.serial("Attendance — record by role", () => {
  let eventId: string
  let campSessionId: string
  let playerId: string

  test("seed", async ({ request }) => {
    await request.post("/api/seed")
  })

  test("admin creates camp event, session, and player", async ({ request }) => {
    await signIn(request, ADMIN)
    const evt = await request.post("/api/events", {
      data: { name: "Attendance Camp", type: "camp" },
    })
    eventId = (await evt.json()).id

    const sess = await request.post("/api/sessions", {
      data: { eventId, name: "Morning Session" },
    })
    campSessionId = (await sess.json()).id

    const pl = await request.post("/api/players", {
      data: { name: "Attendance Player", position: "Forward" },
    })
    playerId = (await pl.json()).id
  })

  for (const actor of ATTENDANCE_RECORDERS) {
    test(`${actor.role} CAN record attendance`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/attendance", {
        data: { eventId, campSessionId, playerId, present: true },
      })
      expect(res.status()).toBe(201)
      expect((await res.json()).present).toBe(true)
    })
  }

  for (const actor of ATTENDANCE_NO_RECORD) {
    test(`${actor.role} CANNOT record attendance (403)`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/attendance", {
        data: { eventId, campSessionId, playerId, present: false },
      })
      expect(res.status()).toBe(403)
    })
  }

  test("unauthenticated user gets 401", async ({ request }) => {
    const res = await request.post("/api/attendance", {
      data: { campSessionId, playerId, present: true },
    })
    expect(res.status()).toBe(401)
  })
})

test.describe("Attendance — read is public", () => {
  test("unauthenticated user can list attendance", async ({ request }) => {
    const res = await request.get("/api/attendance")
    expect(res.ok()).toBeTruthy()
  })
})
