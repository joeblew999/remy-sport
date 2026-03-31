import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import { drizzle } from "drizzle-orm/d1"
import type { AppEnv } from "../types"
import * as schema from "../db/schema"
import { requirePermission } from "../middleware/require-permission"

const BracketSchema = z.object({
  id: z.string(), eventId: z.string(), name: z.string(),
  data: z.string().nullable(), createdBy: z.string(),
  createdAt: z.string(), updatedAt: z.string(),
})

const CreateSchema = z.object({ eventId: z.string().min(1), name: z.string().min(1), data: z.string().optional() })
const ErrorSchema = z.object({ error: z.string() })

function serialize(row: typeof schema.consolationBracket.$inferSelect) {
  return {
    id: row.id, eventId: row.eventId, name: row.name, data: row.data,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  }
}

const consolationBrackets = new OpenAPIHono<AppEnv>()

const listRoute = createRoute({
  method: "get", path: "/api/consolation-brackets",
  responses: { 200: { description: "List consolation brackets", content: { "application/json": { schema: z.object({ consolationBrackets: z.array(BracketSchema) }) } } } },
})

consolationBrackets.openapi(listRoute, async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const rows = await db.select().from(schema.consolationBracket).all()
  return c.json({ consolationBrackets: rows.map(serialize) })
})

const createRoute_ = createRoute({
  method: "post", path: "/api/consolation-brackets",
  request: { body: { content: { "application/json": { schema: CreateSchema } } } },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: BracketSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ErrorSchema } } },
  },
  security: [{ Session: [] }, { ApiKey: [] }],
  middleware: [requirePermission("consolation-bracket", "generate")] as const,
})

consolationBrackets.openapi(createRoute_, async (c) => {
  const user = c.get("user")!
  const body = c.req.valid("json" as never) as z.infer<typeof CreateSchema>
  const db = drizzle(c.env.DB, { schema })
  const now = new Date()
  const id = crypto.randomUUID()
  const row = { id, eventId: body.eventId, name: body.name, data: body.data ?? null, createdBy: user.id, createdAt: now, updatedAt: now }
  await db.insert(schema.consolationBracket).values(row)
  return c.json({ ...row, createdAt: now.toISOString(), updatedAt: now.toISOString() }, 201)
})

export default consolationBrackets
