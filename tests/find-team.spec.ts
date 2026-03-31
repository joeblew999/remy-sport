import { test, expect } from "@playwright/test"
import { signIn, actorsCan, actorsCannot } from "./helpers"

const READERS = actorsCan("find-team", "read")
const NO_READ = actorsCannot("find-team", "read")

test.describe.serial("Find Team — read by role", () => {
  test("seed", async ({ request }) => {
    await request.post("/api/seed")
  })

  for (const actor of READERS) {
    test(`${actor.role} CAN read find-team`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.get("/api/find-team")
      expect(res.ok()).toBeTruthy()
      const body = await res.json()
      expect(body).toHaveProperty("teams")
    })
  }

  for (const actor of NO_READ) {
    test(`${actor.role} CANNOT read find-team (403)`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.get("/api/find-team")
      expect(res.status()).toBe(403)
    })
  }
})
