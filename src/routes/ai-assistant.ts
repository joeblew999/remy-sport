import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import type { AppEnv } from "../types"
import { requirePermission } from "../middleware/require-permission"

const ErrorSchema = z.object({ error: z.string() })

const aiAssistant = new OpenAPIHono<AppEnv>()

// ── POST /api/ai/create-event — AI-assisted event creation ──────────────────

const createEventRoute = createRoute({
  method: "post", path: "/api/ai/create-event",
  request: { body: { content: { "application/json": { schema: z.object({ prompt: z.string().min(1) }) } } } },
  responses: {
    200: { description: "AI event suggestion", content: { "application/json": { schema: z.object({ suggestion: z.object({ name: z.string(), type: z.string(), description: z.string() }) }) } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ErrorSchema } } },
  },
  security: [{ Session: [] }, { ApiKey: [] }],
  middleware: [requirePermission("ai-assistant", "create-event")] as const,
})

aiAssistant.openapi(createEventRoute, async (c) => {
  const body = c.req.valid("json" as never) as { prompt: string }
  // Stub — returns a structured suggestion based on the prompt
  return c.json({
    suggestion: {
      name: `Event from: ${body.prompt.slice(0, 50)}`,
      type: "tournament",
      description: `AI-suggested event based on: "${body.prompt}"`,
    },
  })
})

// ── POST /api/ai/suggest-bracket — AI bracket suggestions ───────────────────

const suggestBracketRoute = createRoute({
  method: "post", path: "/api/ai/suggest-bracket",
  request: { body: { content: { "application/json": { schema: z.object({ eventId: z.string().min(1), teamCount: z.number().int().min(2) }) } } } },
  responses: {
    200: { description: "Bracket suggestion", content: { "application/json": { schema: z.object({ format: z.string(), rounds: z.number(), suggestion: z.string() }) } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ErrorSchema } } },
  },
  security: [{ Session: [] }, { ApiKey: [] }],
  middleware: [requirePermission("ai-assistant", "suggest-bracket")] as const,
})

aiAssistant.openapi(suggestBracketRoute, async (c) => {
  const body = c.req.valid("json" as never) as { eventId: string; teamCount: number }
  const rounds = Math.ceil(Math.log2(body.teamCount))
  return c.json({
    format: body.teamCount <= 8 ? "single-elimination" : "double-elimination",
    rounds,
    suggestion: `Recommended ${rounds}-round bracket for ${body.teamCount} teams`,
  })
})

// ── POST /api/ai/qa — AI Q&A ───────────────────────────────────────────────

const qaRoute = createRoute({
  method: "post", path: "/api/ai/qa",
  request: { body: { content: { "application/json": { schema: z.object({ question: z.string().min(1) }) } } } },
  responses: {
    200: { description: "AI answer", content: { "application/json": { schema: z.object({ answer: z.string() }) } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ErrorSchema } } },
  },
  security: [{ Session: [] }, { ApiKey: [] }],
  middleware: [requirePermission("ai-assistant", "qa")] as const,
})

aiAssistant.openapi(qaRoute, async (c) => {
  const body = c.req.valid("json" as never) as { question: string }
  return c.json({
    answer: `This is a stub response to: "${body.question}". AI integration coming soon.`,
  })
})

export default aiAssistant
