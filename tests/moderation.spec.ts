import { test } from "@playwright/test"
import { authzReadTests } from "./helpers"

test.describe.serial("Moderation — manage by role", () => {
  test("seed", async ({ request }) => {
    await request.post("/api/seed")
  })

  authzReadTests("moderation", "manage", "/api/moderation", "flags")
})
