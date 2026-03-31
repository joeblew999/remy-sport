import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import { drizzle } from "drizzle-orm/d1"
import { eq } from "drizzle-orm"
import type { AppEnv } from "../types"
import * as schema from "../db/schema"
import { requirePermission } from "../middleware/require-permission"

const CourtSchema = z.object({
  id: z.string(),
  name: z.string(),
  eventId: z.string(),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const AssignCourtSchema = z.object({
  name: z.string().min(1),
  eventId: z.string().min(1),
})

const ErrorSchema = z.object({ error: z.string() })

function serialize(row: typeof schema.court.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    eventId: row.eventId,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

const courts = new OpenAPIHono<AppEnv>()

const listRoute = createRoute({
  method: "get",
  path: "/api/courts",
  responses: {
    200: {
      description: "List all courts",
      content: { "application/json": { schema: z.object({ courts: z.array(CourtSchema) }) } },
    },
  },
})

courts.openapi(listRoute, async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const rows = await db.select().from(schema.court).all()
  return c.json({ courts: rows.map(serialize) })
})

const assignRoute = createRoute({
  method: "post",
  path: "/api/courts",
  request: {
    body: { content: { "application/json": { schema: AssignCourtSchema } } },
  },
  responses: {
    201: { description: "Court assigned", content: { "application/json": { schema: CourtSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ErrorSchema } } },
  },
  security: [{ Session: [] }, { ApiKey: [] }],
  middleware: [requirePermission("court", "assign")] as const,
})

courts.openapi(assignRoute, async (c) => {
  const user = c.get("user")!
  const body = c.req.valid("json" as never) as z.infer<typeof AssignCourtSchema>
  const db = drizzle(c.env.DB, { schema })
  const now = new Date()
  const id = crypto.randomUUID()

  const row = {
    id,
    name: body.name,
    eventId: body.eventId,
    createdBy: user.id,
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(schema.court).values(row)

  return c.json(
    { ...row, createdAt: now.toISOString(), updatedAt: now.toISOString() },
    201,
  )
})

export default courts
