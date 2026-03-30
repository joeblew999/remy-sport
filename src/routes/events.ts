import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import { drizzle } from "drizzle-orm/d1"
import { eq } from "drizzle-orm"
import type { AppEnv } from "../types"
import * as schema from "../db/schema"
import { requirePermission } from "../middleware/require-permission"

const EventTypeSchema = z.enum(["tournament", "league", "camp", "showcase"])

const EventSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: EventTypeSchema,
  description: z.string().nullable(),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const CreateEventSchema = z.object({
  name: z.string().min(1),
  type: EventTypeSchema,
  description: z.string().optional(),
})

const ErrorSchema = z.object({ error: z.string() })

const events = new OpenAPIHono<AppEnv>()

// GET /api/events — public, list all events
const listEventsRoute = createRoute({
  method: "get",
  path: "/api/events",
  responses: {
    200: {
      description: "List all events",
      content: { "application/json": { schema: z.object({ events: z.array(EventSchema) }) } },
    },
  },
})

events.openapi(listEventsRoute, async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const rows = await db.select().from(schema.event).all()
  return c.json({
    events: rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
  })
})

// POST /api/events — requires event:create permission
const createEventRoute = createRoute({
  method: "post",
  path: "/api/events",
  request: {
    body: { content: { "application/json": { schema: CreateEventSchema } } },
  },
  responses: {
    201: {
      description: "Event created",
      content: { "application/json": { schema: EventSchema } },
    },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ErrorSchema } } },
  },
  middleware: [requirePermission("event", "create")] as const,
})

events.openapi(createEventRoute, async (c) => {
  const user = c.get("user")!
  const body = c.req.valid("json")
  const db = drizzle(c.env.DB, { schema })
  const now = new Date()
  const id = crypto.randomUUID()

  const row = {
    id,
    name: body.name,
    type: body.type,
    description: body.description ?? null,
    createdBy: user.id,
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(schema.event).values(row)

  return c.json(
    { ...row, createdAt: now.toISOString(), updatedAt: now.toISOString() },
    201,
  )
})

// DELETE /api/events/:id — requires event:delete + ownership
const deleteEventRoute = createRoute({
  method: "delete",
  path: "/api/events/{id}",
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: { description: "Event deleted", content: { "application/json": { schema: z.object({ deleted: z.boolean() }) } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ErrorSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: ErrorSchema } } },
  },
  middleware: [requirePermission("event", "delete")] as const,
})

events.openapi(deleteEventRoute, async (c) => {
  const user = c.get("user")!
  const { id } = c.req.valid("param")
  const db = drizzle(c.env.DB, { schema })

  const existing = await db.select().from(schema.event).where(eq(schema.event.id, id)).get()
  if (!existing) return c.json({ error: "Not found" }, 404)

  // Ownership check: only the creator or admin can delete
  if (existing.createdBy !== user.id && user.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403)
  }

  await db.delete(schema.event).where(eq(schema.event.id, id))
  return c.json({ deleted: true })
})

export default events
