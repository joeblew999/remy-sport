import { test } from "@playwright/test"
import { authzReadTests } from "./helpers"

test.describe.serial("Find Team — read by role", () => {
  test("seed", async ({ request }) => {
    await request.post("/api/seed")
  })

  authzReadTests("find-team", "read", "/api/find-team", "teams")
})
