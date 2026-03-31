import { test, expect } from "@playwright/test"
import { signIn, actorsCan, actorsCannot } from "./helpers"

const TOGGLERS = actorsCan("spoiler", "toggle")
const NO_TOGGLE = actorsCannot("spoiler", "toggle")

test.describe.serial("Spoiler — toggle by role", () => {
  test("seed", async ({ request }) => {
    await request.post("/api/seed")
  })

  for (const actor of TOGGLERS) {
    test(`${actor.role} CAN toggle spoiler`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.put("/api/preferences/spoiler", {
        data: { enabled: false },
      })
      expect(res.ok()).toBeTruthy()
      expect((await res.json()).enabled).toBe(false)
    })
  }

  for (const actor of NO_TOGGLE) {
    test(`${actor.role} CANNOT toggle spoiler (403)`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.put("/api/preferences/spoiler", {
        data: { enabled: false },
      })
      expect(res.status()).toBe(403)
    })
  }

  for (const actor of actorsCan("spoiler", "read")) {
    test(`${actor.role} CAN read spoiler preference`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.get("/api/preferences/spoiler")
      expect(res.ok()).toBeTruthy()
      expect(await res.json()).toHaveProperty("enabled")
    })
  }
})
