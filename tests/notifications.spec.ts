import { test, expect } from "@playwright/test"
import { authzTests, authzReadTests } from "./helpers"

test.describe.serial("Notifications — subscribe by role", () => {
  test("seed", async ({ request }) => {
    await request.post("/api/seed")
  })

  authzTests("notifications", "subscribe", "post", "/api/notifications/subscribe",
    () => ({ type: "push" }),
    { check: (body) => expect(body.type).toBe("push") })

  authzReadTests("notifications", "read", "/api/notifications", "subscriptions")
})
