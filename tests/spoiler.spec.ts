import { test, expect } from "@playwright/test"
import { signIn, authzTests, authzReadTests } from "./helpers"

test.describe.serial("Spoiler — toggle by role", () => {
  test("seed", async ({ request }) => {
    await request.post("/api/seed")
  })

  authzTests("spoiler", "toggle", "put", "/api/preferences/spoiler",
    () => ({ enabled: false }),
    { check: (body) => expect(body.enabled).toBe(false) })

  authzReadTests("spoiler", "read", "/api/preferences/spoiler", "enabled")
})
