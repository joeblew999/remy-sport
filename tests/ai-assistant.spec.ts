import { test, expect } from "@playwright/test"
import { authzTests } from "./helpers"

test.describe.serial("AI Assistant — create-event by role", () => {
  test("seed", async ({ request }) => {
    await request.post("/api/seed")
  })

  authzTests("ai-assistant", "create-event", "post", "/api/ai/create-event",
    () => ({ prompt: "Create a summer basketball tournament" }),
    { status: 200, check: (body) => expect(body).toHaveProperty("suggestion") })

  authzTests("ai-assistant", "qa", "post", "/api/ai/qa",
    () => ({ question: "What is a bracket?" }),
    { status: 200, check: (body) => expect(body).toHaveProperty("answer") })
})
