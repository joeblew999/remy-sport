import { test, expect } from "@playwright/test"
import { ADMIN, ORGANIZER, COACH, PLAYER, SPECTATOR, REFEREE, signIn } from "./helpers"

const STATUS_UPDATERS  = [ADMIN, ORGANIZER, REFEREE]
const NO_STATUS_UPDATE = [COACH, PLAYER, SPECTATOR]

test.describe.serial("Match — status update by role", () => {
  let matchId: string

  test("seed + create match", async ({ request }) => {
    await request.post("/api/seed")
    await signIn(request, ORGANIZER)
    const evt = await request.post("/api/events", {
      data: { name: "Match Status Event", type: "tournament" },
    })
    const eventId = (await evt.json()).id
    const m = await request.post("/api/matches", { data: { eventId } })
    matchId = (await m.json()).id
  })

  for (const actor of STATUS_UPDATERS) {
    test(`${actor.role} CAN update match status`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.put(`/api/matches/${matchId}/status`, {
        data: { status: "in_progress" },
      })
      expect(res.status()).toBe(200)
      expect((await res.json()).status).toBe("in_progress")
    })
  }

  for (const actor of NO_STATUS_UPDATE) {
    test(`${actor.role} CANNOT update match status (403)`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.put(`/api/matches/${matchId}/status`, {
        data: { status: "completed" },
      })
      expect(res.status()).toBe(403)
    })
  }
})
