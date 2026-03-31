import { test, expect } from "@playwright/test"
import { ADMIN, ORGANIZER, COACH, signIn, actorsCan, actorsCannot } from "./helpers"

const CREATORS   = actorsCan("team", "create")
const NO_CREATE  = actorsCannot("team", "create")
const NO_UPDATE  = actorsCannot("team", "update")
const NO_DELETE  = actorsCannot("team", "delete")

// ── team:create by role ────────────────────────────────────────────────────

test.describe.serial("Team — create by role", () => {
  let eventId: string

  test("seed and ensure event exists", async ({ request }) => {
    await request.post("/api/seed")
    await signIn(request, ORGANIZER)
    const res = await request.post("/api/events", {
      data: { name: "Team Test Event", type: "tournament" },
    })
    eventId = (await res.json()).id
  })

  for (const actor of CREATORS) {
    test(`${actor.role} CAN create teams`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/teams", {
        data: { name: `${actor.role}'s team`, eventId },
      })
      expect(res.status()).toBe(201)
      expect((await res.json()).eventId).toBe(eventId)
    })
  }

  for (const actor of NO_CREATE) {
    test(`${actor.role} CANNOT create teams (403)`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/teams", {
        data: { name: `${actor.role} attempt`, eventId },
      })
      expect(res.status()).toBe(403)
    })
  }
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

  for (const actor of NO_DELETE) {
    test(`${actor.role} CANNOT delete any team`, async ({ request }) => {
      await signIn(request, actor)
      const list = await request.get("/api/teams")
      const { teams } = await list.json()
      const res = await request.delete(`/api/teams/${teams[0].id}`)
      expect(res.status()).toBe(403)
    })
  }

  for (const actor of NO_UPDATE) {
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
