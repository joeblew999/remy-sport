import { test, expect } from "@playwright/test"
import { signIn, actorsCan, actorsCannot } from "./helpers"

const SUBSCRIBERS = actorsCan("notifications", "subscribe")
const NO_SUB = actorsCannot("notifications", "subscribe")

test.describe.serial("Notifications — subscribe by role", () => {
  test("seed", async ({ request }) => {
    await request.post("/api/seed")
  })

  for (const actor of SUBSCRIBERS) {
    test(`${actor.role} CAN subscribe to notifications`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/notifications/subscribe", {
        data: { type: "push" },
      })
      expect(res.status()).toBe(201)
      const body = await res.json()
      expect(body.type).toBe("push")
    })
  }

  for (const actor of NO_SUB) {
    test(`${actor.role} CANNOT subscribe to notifications (403)`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/notifications/subscribe", {
        data: { type: "push" },
      })
      expect(res.status()).toBe(403)
    })
  }

  for (const actor of actorsCan("notifications", "read")) {
    test(`${actor.role} CAN read notifications`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.get("/api/notifications")
      expect(res.ok()).toBeTruthy()
      expect(await res.json()).toHaveProperty("subscriptions")
    })
  }
})
