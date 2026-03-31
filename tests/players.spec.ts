import { test, expect } from "@playwright/test"
import { ADMIN, ORGANIZER, COACH, PLAYER, SPECTATOR, REFEREE, signIn } from "./helpers"

const CREATORS   = [ADMIN, COACH, PLAYER]
const NO_CREATE  = [ORGANIZER, SPECTATOR, REFEREE]
const NO_UPDATE  = [ORGANIZER, SPECTATOR, REFEREE]

// ── player:create by role ──────────────────────────────────────────────────

test.describe.serial("Player — create by role", () => {
  test("seed", async ({ request }) => {
    await request.post("/api/seed")
  })

  for (const actor of CREATORS) {
    test(`${actor.role} CAN create player profiles`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/players", {
        data: { name: `${actor.role}'s profile`, position: "Forward" },
      })
      expect(res.status()).toBe(201)
      expect((await res.json()).position).toBe("Forward")
    })
  }

  for (const actor of NO_CREATE) {
    test(`${actor.role} CANNOT create player profiles (403)`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/players", {
        data: { name: `${actor.role} attempt`, position: "Guard" },
      })
      expect(res.status()).toBe(403)
    })
  }
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

  for (const actor of NO_UPDATE) {
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
