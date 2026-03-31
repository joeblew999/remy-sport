import { test, expect } from "@playwright/test"

// All 6 actors from the access matrix (docs/user/matrix.md)
const ADMIN =     { email: "admin@remy.dev",     password: "admin1234!",   role: "admin" }
const ORGANIZER = { email: "organizer@remy.dev", password: "organizer1!",  role: "organizer" }
const COACH =     { email: "coach@remy.dev",     password: "coach12345!",  role: "coach" }
const PLAYER =    { email: "player@remy.dev",    password: "player1234!",  role: "player" }
const SPECTATOR = { email: "spectator@remy.dev", password: "spectator1!",  role: "spectator" }
const REFEREE =   { email: "referee@remy.dev",   password: "referee1234!", role: "referee" }

// Per access-control.ts: admin + coach can create/update teams; only admin can delete
const TEAM_CREATORS = [ADMIN, COACH]
const TEAM_NO_CREATE = [ORGANIZER, PLAYER, SPECTATOR, REFEREE]
const TEAM_NO_UPDATE = [ORGANIZER, PLAYER, SPECTATOR, REFEREE]
const TEAM_NO_DELETE = [ORGANIZER, COACH, PLAYER, SPECTATOR, REFEREE]

async function signIn(request: any, user: { email: string; password: string }) {
  const res = await request.post("/api/auth/sign-in/email", { data: user })
  expect(res.ok()).toBeTruthy()
  return res
}

// ── team:create by role ────────────────────────────────────────────────────

test.describe.serial("Team — create by role", () => {
  let eventId: string

  test("seed and ensure event exists", async ({ request }) => {
    await request.post("/api/seed")
    // Need an event for team.eventId — create one
    await signIn(request, ORGANIZER)
    const res = await request.post("/api/events", {
      data: { name: "Team Test Event", type: "tournament" },
    })
    eventId = (await res.json()).id
  })

  for (const actor of TEAM_CREATORS) {
    test(`${actor.role} CAN create teams`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/teams", {
        data: { name: `${actor.role}'s team`, eventId },
      })
      expect(res.status()).toBe(201)
      expect((await res.json()).eventId).toBe(eventId)
    })
  }

  for (const actor of TEAM_NO_CREATE) {
    test(`${actor.role} CANNOT create teams (403)`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/teams", {
        data: { name: `${actor.role} attempt`, eventId },
      })
      expect(res.status()).toBe(403)
    })
  }

  test("unauthenticated user gets 401", async ({ request }) => {
    const res = await request.post("/api/teams", {
      data: { name: "Unauth", eventId },
    })
    expect(res.status()).toBe(401)
  })
})

// ── team:read is public ────────────────────────────────────────────────────

test.describe("Team — read is public", () => {
  test("unauthenticated user can list teams", async ({ request }) => {
    const res = await request.get("/api/teams")
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.teams.length).toBeGreaterThan(0)
  })

  test("unauthenticated user can get single team", async ({ request }) => {
    const list = await request.get("/api/teams")
    const { teams } = await list.json()
    const res = await request.get(`/api/teams/${teams[0].id}`)
    expect(res.ok()).toBeTruthy()
    expect((await res.json()).id).toBe(teams[0].id)
  })

  test("returns 404 for nonexistent team", async ({ request }) => {
    const res = await request.get("/api/teams/nonexistent-id")
    expect(res.status()).toBe(404)
  })
})

// ── team:update/delete + ownership ─────────────────────────────────────────

test.describe.serial("Team — ownership on update/delete", () => {
  let coachTeamId: string
  let adminTeamId: string
  let eventId: string

  test("seed", async ({ request }) => {
    await request.post("/api/seed")
  })

  test("organizer creates event for teams", async ({ request }) => {
    await signIn(request, ORGANIZER)
    const res = await request.post("/api/events", {
      data: { name: "Ownership Event", type: "tournament" },
    })
    eventId = (await res.json()).id
  })

  test("coach creates team", async ({ request }) => {
    await signIn(request, COACH)
    const res = await request.post("/api/teams", {
      data: { name: "Coach Owned Team", eventId },
    })
    coachTeamId = (await res.json()).id
  })

  test("admin creates team", async ({ request }) => {
    await signIn(request, ADMIN)
    const res = await request.post("/api/teams", {
      data: { name: "Admin Owned Team", eventId },
    })
    adminTeamId = (await res.json()).id
  })

  test("coach can update own team", async ({ request }) => {
    await signIn(request, COACH)
    const res = await request.put(`/api/teams/${coachTeamId}`, {
      data: { name: "Updated by Coach" },
    })
    expect(res.ok()).toBeTruthy()
    expect((await res.json()).name).toBe("Updated by Coach")
  })

  test("coach CANNOT update admin's team (ownership denied)", async ({ request }) => {
    await signIn(request, COACH)
    const res = await request.put(`/api/teams/${adminTeamId}`, {
      data: { name: "Hijacked!" },
    })
    expect(res.status()).toBe(403)
  })

  test("admin CAN update coach's team (admin bypass)", async ({ request }) => {
    await signIn(request, ADMIN)
    const res = await request.put(`/api/teams/${coachTeamId}`, {
      data: { name: "Admin Override" },
    })
    expect(res.ok()).toBeTruthy()
    expect((await res.json()).name).toBe("Admin Override")
  })

  test("admin can delete a team", async ({ request }) => {
    await signIn(request, ADMIN)
    const create = await request.post("/api/teams", {
      data: { name: "Throwaway", eventId },
    })
    const id = (await create.json()).id
    const del = await request.delete(`/api/teams/${id}`)
    expect(del.ok()).toBeTruthy()
  })

  for (const actor of TEAM_NO_DELETE) {
    test(`${actor.role} CANNOT delete any team`, async ({ request }) => {
      await signIn(request, actor)
      const list = await request.get("/api/teams")
      const { teams } = await list.json()
      const res = await request.delete(`/api/teams/${teams[0].id}`)
      expect(res.status()).toBe(403)
    })
  }

  for (const actor of TEAM_NO_UPDATE) {
    test(`${actor.role} CANNOT update any team`, async ({ request }) => {
      await signIn(request, actor)
      const list = await request.get("/api/teams")
      const { teams } = await list.json()
      const res = await request.put(`/api/teams/${teams[0].id}`, {
        data: { name: "Nope" },
      })
      expect(res.status()).toBe(403)
    })
  }
})

// ── OpenAPI spec ───────────────────────────────────────────────────────────

test.describe("Team — OpenAPI docs", () => {
  test("protected team routes declare security schemes", async ({ request }) => {
    const res = await request.get("/openapi.json")
    const spec = await res.json()

    const postTeams = spec.paths["/api/teams"]?.post
    expect(postTeams.security).toContainEqual({ Session: [] })
    expect(postTeams.security).toContainEqual({ ApiKey: [] })

    const putTeam = spec.paths["/api/teams/{id}"]?.put
    expect(putTeam.security).toContainEqual({ Session: [] })
    const deleteTeam = spec.paths["/api/teams/{id}"]?.delete
    expect(deleteTeam.security).toContainEqual({ Session: [] })

    // GET is public
    expect(spec.paths["/api/teams"]?.get?.security).toBeFalsy()
  })
})
