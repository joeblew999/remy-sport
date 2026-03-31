import { test, expect } from "@playwright/test"
import { signIn, actorsCan, actorsCannot } from "./helpers"

const MANAGERS = actorsCan("moderation", "manage")
const NO_MANAGE = actorsCannot("moderation", "manage")

test.describe.serial("Moderation — manage by role", () => {
  test("seed", async ({ request }) => {
    await request.post("/api/seed")
  })

  for (const actor of MANAGERS) {
    test(`${actor.role} CAN list moderation flags`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.get("/api/moderation")
      expect(res.ok()).toBeTruthy()
      expect(await res.json()).toHaveProperty("flags")
    })
  }

  for (const actor of NO_MANAGE) {
    test(`${actor.role} CANNOT list moderation flags (403)`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.get("/api/moderation")
      expect(res.status()).toBe(403)
    })
  }
})
