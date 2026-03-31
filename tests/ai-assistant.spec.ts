import { test, expect } from "@playwright/test"
import { signIn, actorsCan, actorsCannot } from "./helpers"

const EVENT_CREATORS = actorsCan("ai-assistant", "create-event")
const NO_EVENT_CREATE = actorsCannot("ai-assistant", "create-event")

test.describe.serial("AI Assistant — create-event by role", () => {
  test("seed", async ({ request }) => {
    await request.post("/api/seed")
  })

  for (const actor of EVENT_CREATORS) {
    test(`${actor.role} CAN use AI create-event`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/ai/create-event", {
        data: { prompt: "Create a summer basketball tournament" },
      })
      expect(res.ok()).toBeTruthy()
      expect(await res.json()).toHaveProperty("suggestion")
    })
  }

  for (const actor of NO_EVENT_CREATE) {
    test(`${actor.role} CANNOT use AI create-event (403)`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/ai/create-event", {
        data: { prompt: "test" },
      })
      expect(res.status()).toBe(403)
    })
  }

  for (const actor of actorsCan("ai-assistant", "qa")) {
    test(`${actor.role} CAN use AI Q&A`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/ai/qa", {
        data: { question: "What is a bracket?" },
      })
      expect(res.ok()).toBeTruthy()
      expect(await res.json()).toHaveProperty("answer")
    })
  }
})
