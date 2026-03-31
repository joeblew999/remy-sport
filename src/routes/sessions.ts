import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import { drizzle } from "drizzle-orm/d1"
import { eq } from "drizzle-orm"
import type { AppEnv } from "../types"
import * as schema from "../db/schema"
import { requirePermission } from "../middleware/require-permission"

const CampSessionSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  name: z.string(),
  scheduledAt: z.string().nullable(),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const DefineSessionSchema = z.object({
  eventId: z.string().min(1),
  name: z.string().min(1),
  scheduledAt: z.string().optional(),
})

const ErrorSchema = z.object({ error: z.string() })

function serialize(row: typeof schema.campSession.$inferSelect) {
  return {
    id: row.id,
    eventId: row.eventId,
    name: row.name,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

const sessions = new OpenAPIHono<AppEnv>()

const listRoute = createRoute({
  method: "get",
  path: "/api/sessions",
  responses: {
    200: {
      description: "List all camp sessions",
      content: { "application/json": { schema: z.object({ sessions: z.array(CampSessionSchema) }) } },
    },
  },
})

sessions.openapi(listRoute, async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const rows = await db.select().from(schema.campSession).all()
  return c.json({ sessions: rows.map(serialize) })
})

const getRoute = createRoute({
  method: "get",
  path: "/api/sessions/{id}",
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: "Camp session details", content: { "application/json": { schema: CampSessionSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: ErrorSchema } } },
  },
})

sessions.openapi(getRoute, async (c) => {
  const { id } = c.req.valid("param")
  const db = drizzle(c.env.DB, { schema })
  const row = await db.select().from(schema.campSession).where(eq(schema.campSession.id, id)).get()
  if (!row) return c.json({ error: "Not found" }, 404)
  return c.json(serialize(row), 200)
})

const defineRoute = createRoute({
  method: "post",
  path: "/api/sessions",
  request: {
    body: { content: { "application/json": { schema: DefineSessionSchema } } },
  },
  responses: {
    201: { description: "Camp session defined", content: { "application/json": { schema: CampSessionSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ErrorSchema } } },
  },
  security: [{ Session: [] }, { ApiKey: [] }],
  middleware: [requirePermission("session", "define")] as const,
})

sessions.openapi(defineRoute, async (c) => {
  const user = c.get("user")!
  const body = c.req.valid("json" as never) as z.infer<typeof DefineSessionSchema>
  const db = drizzle(c.env.DB, { schema })
  const now = new Date()
  const id = crypto.randomUUID()

  const row = {
    id,
    eventId: body.eventId,
    name: body.name,
    scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
    createdBy: user.id,
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(schema.campSession).values(row)

  return c.json(
    {
      ...row,
      scheduledAt: row.scheduledAt?.toISOString() ?? null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    201,
  )
})

export default sessions
