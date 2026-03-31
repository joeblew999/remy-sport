import { test, expect } from "@playwright/test"

const ADMIN =     { email: "admin@remy.dev",     password: "admin1234!",   role: "admin" }
const ORGANIZER = { email: "organizer@remy.dev", password: "organizer1!",  role: "organizer" }

async function signIn(request: any, user: { email: string; password: string }) {
  const res = await request.post("/api/auth/sign-in/email", { data: user })
  expect(res.ok()).toBeTruthy()
  return res
}

// ── Layer 3: Event type scoping ────────────────────────────────────────────

test.describe.serial("Event type scoping — brackets", () => {
  let tournamentId: string
  let campId: string

  test("seed + create events of different types", async ({ request }) => {
    await request.post("/api/seed")
    await signIn(request, ORGANIZER)
    const t = await request.post("/api/events", {
      data: { name: "Bracket Tournament", type: "tournament" },
    })
    tournamentId = (await t.json()).id
  })

  test("create camp event", async ({ request }) => {
    await signIn(request, ORGANIZER)
    const c = await request.post("/api/events", {
      data: { name: "Bracket Camp", type: "camp" },
    })
    campId = (await c.json()).id
  })

  test("bracket generation succeeds for tournament", async ({ request }) => {
    await signIn(request, ORGANIZER)
    const res = await request.post("/api/brackets", {
      data: { eventId: tournamentId, name: "Main Draw" },
    })
    expect(res.status()).toBe(201)
  })

  test("bracket generation rejected for camp (422)", async ({ request }) => {
    await signIn(request, ORGANIZER)
    const res = await request.post("/api/brackets", {
      data: { eventId: campId, name: "Nope" },
    })
    expect(res.status()).toBe(422)
    const body = await res.json()
    expect(body.error).toContain("Not applicable")
  })
})

test.describe.serial("Event type scoping — fixtures", () => {
  let leagueId: string
  let campId: string

  test("seed + create events", async ({ request }) => {
    await request.post("/api/seed")
    await signIn(request, ORGANIZER)
    const l = await request.post("/api/events", {
      data: { name: "Fixture League", type: "league" },
    })
    leagueId = (await l.json()).id
  })

  test("create camp event", async ({ request }) => {
    await signIn(request, ORGANIZER)
    const c = await request.post("/api/events", {
      data: { name: "Fixture Camp", type: "camp" },
    })
    campId = (await c.json()).id
  })

  test("fixture generation succeeds for league", async ({ request }) => {
    await signIn(request, ORGANIZER)
    const res = await request.post("/api/fixtures", {
      data: { eventId: leagueId, name: "Round Robin" },
    })
    expect(res.status()).toBe(201)
  })

  test("fixture generation rejected for camp (422)", async ({ request }) => {
    await signIn(request, ORGANIZER)
    const res = await request.post("/api/fixtures", {
      data: { eventId: campId, name: "Nope" },
    })
    expect(res.status()).toBe(422)
  })
})

test.describe.serial("Event type scoping — sessions (camp only)", () => {
  let campId: string
  let tournamentId: string

  test("seed + create events", async ({ request }) => {
    await request.post("/api/seed")
    await signIn(request, ORGANIZER)
    const c = await request.post("/api/events", {
      data: { name: "Session Camp", type: "camp" },
    })
    campId = (await c.json()).id
  })

  test("create tournament event", async ({ request }) => {
    await signIn(request, ORGANIZER)
    const t = await request.post("/api/events", {
      data: { name: "Session Tournament", type: "tournament" },
    })
    tournamentId = (await t.json()).id
  })

  test("session definition succeeds for camp", async ({ request }) => {
    await signIn(request, ORGANIZER)
    const res = await request.post("/api/sessions", {
      data: { eventId: campId, name: "Morning Drill" },
    })
    expect(res.status()).toBe(201)
  })

  test("session definition rejected for tournament (422)", async ({ request }) => {
    await signIn(request, ORGANIZER)
    const res = await request.post("/api/sessions", {
      data: { eventId: tournamentId, name: "Nope" },
    })
    expect(res.status()).toBe(422)
  })
})

test.describe.serial("Event type scoping — attendance (camp only)", () => {
  let campId: string
  let tournamentId: string
  let sessionId: string
  let playerId: string

  test("seed + create camp with session and player", async ({ request }) => {
    await request.post("/api/seed")
    await signIn(request, ADMIN)
    const c = await request.post("/api/events", {
      data: { name: "Attendance Camp", type: "camp" },
    })
    campId = (await c.json()).id

    const s = await request.post("/api/sessions", {
      data: { eventId: campId, name: "Afternoon" },
    })
    sessionId = (await s.json()).id

    const p = await request.post("/api/players", {
      data: { name: "Attendance Player" },
    })
    playerId = (await p.json()).id
  })

  test("create tournament event", async ({ request }) => {
    await signIn(request, ORGANIZER)
    const t = await request.post("/api/events", {
      data: { name: "Attendance Tournament", type: "tournament" },
    })
    tournamentId = (await t.json()).id
  })

  test("attendance recording succeeds for camp", async ({ request }) => {
    await signIn(request, ADMIN)
    const res = await request.post("/api/attendance", {
      data: { eventId: campId, campSessionId: sessionId, playerId, present: true },
    })
    expect(res.status()).toBe(201)
  })

  test("attendance recording rejected for tournament (422)", async ({ request }) => {
    await signIn(request, ADMIN)
    const res = await request.post("/api/attendance", {
      data: { eventId: tournamentId, campSessionId: sessionId, playerId, present: true },
    })
    expect(res.status()).toBe(422)
  })
})
