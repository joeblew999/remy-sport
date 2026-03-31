import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import { drizzle } from "drizzle-orm/d1"
import { eq } from "drizzle-orm"
import type { AppEnv } from "../types"
import * as schema from "../db/schema"
import { requirePermission } from "../middleware/require-permission"
import { requireEventType } from "../middleware/event-type"

const BracketSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  name: z.string(),
  data: z.string().nullable(),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const GenerateBracketSchema = z.object({
  eventId: z.string().min(1),
  name: z.string().min(1),
  data: z.string().optional(),
})

const ErrorSchema = z.object({ error: z.string() })

function serialize(row: typeof schema.bracket.$inferSelect) {
  return {
    id: row.id,
    eventId: row.eventId,
    name: row.name,
    data: row.data,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

const brackets = new OpenAPIHono<AppEnv>()

const listRoute = createRoute({
  method: "get",
  path: "/api/brackets",
  responses: {
    200: {
      description: "List all brackets",
      content: { "application/json": { schema: z.object({ brackets: z.array(BracketSchema) }) } },
    },
  },
})

brackets.openapi(listRoute, async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const rows = await db.select().from(schema.bracket).all()
  return c.json({ brackets: rows.map(serialize) })
})

const getRoute = createRoute({
  method: "get",
  path: "/api/brackets/{id}",
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: "Bracket details", content: { "application/json": { schema: BracketSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: ErrorSchema } } },
  },
})

brackets.openapi(getRoute, async (c) => {
  const { id } = c.req.valid("param")
  const db = drizzle(c.env.DB, { schema })
  const row = await db.select().from(schema.bracket).where(eq(schema.bracket.id, id)).get()
  if (!row) return c.json({ error: "Not found" }, 404)
  return c.json(serialize(row), 200)
})

const generateRoute = createRoute({
  method: "post",
  path: "/api/brackets",
  request: {
    body: { content: { "application/json": { schema: GenerateBracketSchema } } },
  },
  responses: {
    201: { description: "Bracket generated", content: { "application/json": { schema: BracketSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ErrorSchema } } },
    422: { description: "Not applicable for this event type", content: { "application/json": { schema: ErrorSchema } } },
  },
  security: [{ Session: [] }, { ApiKey: [] }],
  middleware: [requirePermission("bracket", "generate"), requireEventType("tournament", "showcase")] as const,
})

brackets.openapi(generateRoute, async (c) => {
  const user = c.get("user")!
  const body = c.req.valid("json" as never) as z.infer<typeof GenerateBracketSchema>
  const db = drizzle(c.env.DB, { schema })
  const now = new Date()
  const id = crypto.randomUUID()

  const row = {
    id,
    eventId: body.eventId,
    name: body.name,
    data: body.data ?? null,
    createdBy: user.id,
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(schema.bracket).values(row)

  return c.json(
    { ...row, createdAt: now.toISOString(), updatedAt: now.toISOString() },
    201,
  )
})

export default brackets
