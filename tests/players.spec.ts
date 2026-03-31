import { test, expect } from "@playwright/test"

// All 6 actors from the access matrix (docs/user/matrix.md)
const ADMIN =     { email: "admin@remy.dev",     password: "admin1234!",   role: "admin" }
const ORGANIZER = { email: "organizer@remy.dev", password: "organizer1!",  role: "organizer" }
const COACH =     { email: "coach@remy.dev",     password: "coach12345!",  role: "coach" }
const PLAYER =    { email: "player@remy.dev",    password: "player1234!",  role: "player" }
const SPECTATOR = { email: "spectator@remy.dev", password: "spectator1!",  role: "spectator" }
const REFEREE =   { email: "referee@remy.dev",   password: "referee1234!", role: "referee" }

// Per access-control.ts: admin + coach + player can create/update profiles
const PLAYER_CREATORS = [ADMIN, COACH, PLAYER]
const PLAYER_NO_CREATE = [ORGANIZER, SPECTATOR, REFEREE]
const PLAYER_NO_UPDATE = [ORGANIZER, SPECTATOR, REFEREE]

async function signIn(request: any, user: { email: string; password: string }) {
  const res = await request.post("/api/auth/sign-in/email", { data: user })
  expect(res.ok()).toBeTruthy()
  return res
}

// ── player:create by role ──────────────────────────────────────────────────

test.describe.serial("Player — create by role", () => {
  test("seed", async ({ request }) => {
    await request.post("/api/seed")
  })

  for (const actor of PLAYER_CREATORS) {
    test(`${actor.role} CAN create player profiles`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/players", {
        data: { name: `${actor.role}'s profile`, position: "Forward" },
      })
      expect(res.status()).toBe(201)
      expect((await res.json()).position).toBe("Forward")
    })
  }

  for (const actor of PLAYER_NO_CREATE) {
    test(`${actor.role} CANNOT create player profiles (403)`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/players", {
        data: { name: `${actor.role} attempt`, position: "Guard" },
      })
      expect(res.status()).toBe(403)
    })
  }

  test("unauthenticated user gets 401", async ({ request }) => {
    const res = await request.post("/api/players", {
      data: { name: "Unauth", position: "Center" },
    })
    expect(res.status()).toBe(401)
  })
})

// ── player:read is public ──────────────────────────────────────────────────

test.describe("Player — read is public", () => {
  test("unauthenticated user can list players", async ({ request }) => {
    const res = await request.get("/api/players")
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.players.length).toBeGreaterThan(0)
  })

  test("unauthenticated user can get single player", async ({ request }) => {
    const list = await request.get("/api/players")
    const { players } = await list.json()
    const res = await request.get(`/api/players/${players[0].id}`)
    expect(res.ok()).toBeTruthy()
    expect((await res.json()).id).toBe(players[0].id)
  })

  test("returns 404 for nonexistent player", async ({ request }) => {
    const res = await request.get("/api/players/nonexistent-id")
    expect(res.status()).toBe(404)
  })
})

// ── player:update + ownership ──────────────────────────────────────────────

test.describe.serial("Player — ownership on update", () => {
  let playerProfileId: string
  let coachProfileId: string

  test("seed", async ({ request }) => {
    await request.post("/api/seed")
  })

  test("player creates profile", async ({ request }) => {
    await signIn(request, PLAYER)
    const res = await request.post("/api/players", {
      data: { name: "Player Owned Profile", position: "Wing" },
    })
    playerProfileId = (await res.json()).id
  })

  test("coach creates profile", async ({ request }) => {
    await signIn(request, COACH)
    const res = await request.post("/api/players", {
      data: { name: "Coach Created Profile", position: "Center" },
    })
    coachProfileId = (await res.json()).id
  })

  test("player can update own profile", async ({ request }) => {
    await signIn(request, PLAYER)
    const res = await request.put(`/api/players/${playerProfileId}`, {
      data: { name: "Updated by Player" },
    })
    expect(res.ok()).toBeTruthy()
    expect((await res.json()).name).toBe("Updated by Player")
  })

  test("player CANNOT update coach's profile (ownership denied)", async ({ request }) => {
    await signIn(request, PLAYER)
    const res = await request.put(`/api/players/${coachProfileId}`, {
      data: { name: "Hijacked!" },
    })
    expect(res.status()).toBe(403)
  })

  test("admin CAN update player's profile (admin bypass)", async ({ request }) => {
    await signIn(request, ADMIN)
    const res = await request.put(`/api/players/${playerProfileId}`, {
      data: { position: "Admin Override" },
    })
    expect(res.ok()).toBeTruthy()
    expect((await res.json()).position).toBe("Admin Override")
  })

  test("coach can update own profile", async ({ request }) => {
    await signIn(request, COACH)
    const res = await request.put(`/api/players/${coachProfileId}`, {
      data: { name: "Updated by Coach" },
    })
    expect(res.ok()).toBeTruthy()
  })

  for (const actor of PLAYER_NO_UPDATE) {
    test(`${actor.role} CANNOT update any player profile`, async ({ request }) => {
      await signIn(request, actor)
      const list = await request.get("/api/players")
      const { players } = await list.json()
      const res = await request.put(`/api/players/${players[0].id}`, {
        data: { name: "Nope" },
      })
      expect(res.status()).toBe(403)
    })
  }
})

// ── OpenAPI spec ───────────────────────────────────────────────────────────

test.describe("Player — OpenAPI docs", () => {
  test("protected player routes declare security schemes", async ({ request }) => {
    const res = await request.get("/openapi.json")
    const spec = await res.json()

    const postPlayers = spec.paths["/api/players"]?.post
    expect(postPlayers.security).toContainEqual({ Session: [] })
    expect(postPlayers.security).toContainEqual({ ApiKey: [] })

    const putPlayer = spec.paths["/api/players/{id}"]?.put
    expect(putPlayer.security).toContainEqual({ Session: [] })

    // GET is public
    expect(spec.paths["/api/players"]?.get?.security).toBeFalsy()
  })
})
