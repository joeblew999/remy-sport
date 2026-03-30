import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import { drizzle } from "drizzle-orm/d1"
import { eq } from "drizzle-orm"
import type { AppEnv } from "../types"
import * as schema from "../db/schema"
import { requirePermission } from "../middleware/require-permission"
import { ownedBy } from "../middleware/owned-by"

const EventTypeSchema = z.enum(["tournament", "league", "camp", "showcase"])
type EventType = z.infer<typeof EventTypeSchema>

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

const UpdateEventSchema = z.object({
  name: z.string().min(1).optional(),
  type: EventTypeSchema.optional(),
  description: z.string().optional(),
})

const ErrorSchema = z.object({ error: z.string() })

function serializeEvent(row: typeof schema.event.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    type: row.type as EventType,
    description: row.description,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

const events = new OpenAPIHono<AppEnv>()

// ── GET /api/events — public, list all events ──────────────────────────────

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
  return c.json({ events: rows.map(serializeEvent) })
})

// ── GET /api/events/:id — public, get single event ─────────────────────────

const getEventRoute = createRoute({
  method: "get",
  path: "/api/events/{id}",
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      description: "Event details",
      content: { "application/json": { schema: EventSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: ErrorSchema } } },
  },
})

events.openapi(getEventRoute, async (c) => {
  const { id } = c.req.valid("param")
  const db = drizzle(c.env.DB, { schema })
  const row = await db.select().from(schema.event).where(eq(schema.event.id, id)).get()
  if (!row) return c.json({ error: "Not found" }, 404)
  return c.json(serializeEvent(row), 200)
})

// ── POST /api/events — requires event:create ────────────────────────────────

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
  security: [{ Session: [] }, { ApiKey: [] }],
  middleware: [
    requirePermission("event", "create"),
  ] as const,
})

events.openapi(createEventRoute, async (c) => {
  const user = c.get("user")!
  const body = c.req.valid("json" as never) as z.infer<typeof CreateEventSchema>
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
    {
      ...row,
      type: row.type as EventType,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    201,
  )
})

// ── PUT /api/events/:id — requires event:update + ownership ─────────────────

const updateEventRoute = createRoute({
  method: "put",
  path: "/api/events/{id}",
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { "application/json": { schema: UpdateEventSchema } } },
  },
  responses: {
    200: {
      description: "Event updated",
      content: { "application/json": { schema: EventSchema } },
    },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ErrorSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: ErrorSchema } } },
  },
  security: [{ Session: [] }, { ApiKey: [] }],
  middleware: [
    requirePermission("event", "update"),
    ownedBy(schema.event, "id"),
  ] as const,
})

events.openapi(updateEventRoute, async (c) => {
  const { id } = c.req.valid("param" as never) as { id: string }
  const body = c.req.valid("json" as never) as z.infer<typeof UpdateEventSchema>
  const db = drizzle(c.env.DB, { schema })
  const now = new Date()

  await db
    .update(schema.event)
    .set({ ...body, updatedAt: now })
    .where(eq(schema.event.id, id))

  const updated = await db.select().from(schema.event).where(eq(schema.event.id, id)).get()
  if (!updated) return c.json({ error: "Not found" }, 404)
  return c.json(serializeEvent(updated), 200)
})

// ── DELETE /api/events/:id — requires event:delete + ownership ──────────────

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
  security: [{ Session: [] }, { ApiKey: [] }],
  middleware: [
    requirePermission("event", "delete"),
    ownedBy(schema.event, "id"),
  ] as const,
})

events.openapi(deleteEventRoute, async (c) => {
  const { id } = c.req.valid("param" as never) as { id: string }
  const db = drizzle(c.env.DB, { schema })
  await db.delete(schema.event).where(eq(schema.event.id, id))
  return c.json({ deleted: true })
})

export default events
