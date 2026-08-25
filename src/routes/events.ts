import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import { drizzle } from "drizzle-orm/d1"
import { eq, sql } from "drizzle-orm"
import type { AppEnv } from "../types"
import * as schema from "../db/schema"
import { requirePermission } from "../middleware/require-permission"
import { ownedBy } from "../middleware/owned-by"
import { EVENT_TYPE_CODES, EVENT_FORMAT_CODES, CITY_CODES } from "../domain/vocabularies"
import { deleteNames, pivot, readNames, writeNames, type Names } from "../domain/localized"

// Canonical vocabularies from remy-sport-biz/data/seed/, via the generated
// domain module. Event type codes are lowercase there — a deliberate delta from
// the fixtures, applied by the generator rather than by hand, so this enum and
// the published OpenAPI spec cannot drift apart.
const EventTypeSchema = z.enum(EVENT_TYPE_CODES)
type EventType = z.infer<typeof EventTypeSchema>

const EventFormatSchema = z.enum(EVENT_FORMAT_CODES)
type EventFormat = z.infer<typeof EventFormatSchema>

// The biz schema stores dates as ISO 8601 day strings, not timestamps.
const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")

/**
 * Display names keyed by locale — the same shape /api/reference and /api/teams
 * return. Never a `nameTh` field: see src/domain/localized.ts.
 */
const NamesSchema = z.record(z.string(), z.string()).openapi({
  description: "Display names keyed by locale code",
  example: { en: "Bangkok Schools League 2026", th: "ลีกบาสเกตบอลโรงเรียนกรุงเทพ 2026" },
})

const EventSchema = z.object({
  id: z.string(),
  /** The English pivot stored on the row: a guaranteed non-empty fallback. */
  name: z.string(),
  names: NamesSchema,
  type: EventTypeSchema,
  format: EventFormatSchema,
  description: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  // A code, not a display name — so the SPA can render it in the reader's
  // language via /api/reference rather than showing "Bangkok" to everyone.
  cityCode: z.string().nullable(),
  provinceCode: z.string().nullable(),
  isFibaCertified: z.boolean(),
  createdBy: z.string(),
  // Display label for "organised by". Canonical resolves this as
  // COALESCE(org.name, user.name); with no `orgs` table here it is the
  // organizer's user name, joined from created_by. Null if the user is gone.
  organizerName: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

// Only `name` and `type` are required, so every existing caller — the dashboard
// form, tests/authz.spec.ts, curl scripts — keeps working unchanged (ADR 008).
const CreateEventSchema = z.object({
  names: NamesSchema.refine((n) => Object.values(n).some((v) => v?.trim()), {
    message: "at least one locale must carry a name",
  }),
  type: EventTypeSchema,
  format: EventFormatSchema.optional(),
  description: z.string().optional(),
  startDate: DateSchema.optional(),
  endDate: DateSchema.optional(),
  cityCode: z.enum(CITY_CODES).optional(),
  provinceCode: z.string().optional(),
  isFibaCertified: z.boolean().optional(),
})

const UpdateEventSchema = CreateEventSchema.partial()

const ErrorSchema = z.object({ error: z.string() })

function serializeEvent(
  row: typeof schema.event.$inferSelect,
  organizerName: string | null = null,
  names: Names = {},
) {
  return {
    id: row.id,
    name: row.name,
    // The pivot is always a valid name, so an event with no catalogue rows
    // still serialises to something renderable rather than to `{}`.
    names: Object.keys(names).length ? names : { en: row.name },
    type: row.type as EventType,
    format: row.format as EventFormat,
    description: row.description,
    startDate: row.startDate,
    endDate: row.endDate,
    cityCode: row.cityCode,
    provinceCode: row.provinceCode,
    isFibaCertified: row.isFibaCertified,
    createdBy: row.createdBy,
    organizerName,
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
  // leftJoin, not innerJoin: an event must still list if its organizer's user
  // row is missing. Ordered by start date so the SPA's discover page gets a
  // stable, meaningful sequence without sorting client-side.
  //
  // `start_date IS NULL` first, because SQLite sorts NULLs before everything
  // and undated events would otherwise head the list — pushing every real,
  // scheduled event below a wall of "Dates TBC".
  const rows = await db
    .select({ event: schema.event, organizerName: schema.user.name })
    .from(schema.event)
    .leftJoin(schema.user, eq(schema.event.createdBy, schema.user.id))
    .orderBy(sql`${schema.event.startDate} IS NULL`, schema.event.startDate)
    .all()
  // One batched lookup for the page, not one per event.
  const names = await readNames(db, "event", rows.map((r) => r.event.id))
  return c.json({
    events: rows.map((r) => serializeEvent(r.event, r.organizerName, names.get(r.event.id) ?? {})),
  })
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
  const row = await db
    .select({ event: schema.event, organizerName: schema.user.name })
    .from(schema.event)
    .leftJoin(schema.user, eq(schema.event.createdBy, schema.user.id))
    .where(eq(schema.event.id, id))
    .get()
  if (!row) return c.json({ error: "Not found" }, 404)
  const names = await readNames(db, "event", [row.event.id])
  return c.json(serializeEvent(row.event, row.organizerName, names.get(row.event.id) ?? {}), 200)
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
    400: { description: "Invalid dates", content: { "application/json": { schema: ErrorSchema } } },
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

  // Canonical: "end_date must be >= start_date". Zod cannot express a
  // cross-field rule on a partial, so it is checked here for both create and
  // update. ISO day strings compare correctly as plain strings.
  if (body.startDate && body.endDate && body.endDate < body.startDate) {
    return c.json({ error: "endDate must be on or after startDate" }, 400)
  }

  const row = {
    id: crypto.randomUUID(),
    name: pivot(body.names)!, // the refine above guarantees one
    type: body.type,
    format: body.format ?? "5x5",
    description: body.description ?? null,
    // A single-day event needs only startDate; end defaults to the same day.
    startDate: body.startDate ?? null,
    endDate: body.endDate ?? body.startDate ?? null,
    cityCode: body.cityCode ?? null,
    provinceCode: body.provinceCode ?? null,
    isFibaCertified: body.isFibaCertified ?? false,
    createdBy: user.id,
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(schema.event).values(row)
  await writeNames(db, "event", row.id, body.names)

  // The creator is the organizer, so the display name needs no round trip.
  return c.json(serializeEvent(row, user.name ?? null, body.names), 201)
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
    400: { description: "Invalid dates", content: { "application/json": { schema: ErrorSchema } } },
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

  const existing = await db.select().from(schema.event).where(eq(schema.event.id, id)).get()
  if (!existing) return c.json({ error: "Not found" }, 404)

  // Validate against the merged row, not the patch: sending only endDate must
  // still be checked against the startDate already stored.
  const startDate = body.startDate ?? existing.startDate
  const endDate = body.endDate ?? existing.endDate
  if (startDate && endDate && endDate < startDate) {
    return c.json({ error: "endDate must be on or after startDate" }, 400)
  }

  const { names, ...columns } = body
  // The pivot moves with the names, so `name` never goes stale against the
  // catalogue — it is derived, not separately editable.
  await db
    .update(schema.event)
    .set({ ...columns, ...(names ? { name: pivot(names) } : {}), updatedAt: now })
    .where(eq(schema.event.id, id))
  if (names) await writeNames(db, "event", id, names)

  const updated = await db
    .select({ event: schema.event, organizerName: schema.user.name })
    .from(schema.event)
    .leftJoin(schema.user, eq(schema.event.createdBy, schema.user.id))
    .where(eq(schema.event.id, id))
    .get()
  if (!updated) return c.json({ error: "Not found" }, 404)
  const stored = await readNames(db, "event", [id])
  return c.json(serializeEvent(updated.event, updated.organizerName, stored.get(id) ?? {}), 200)
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
  // The catalogue is polymorphic and cannot FK to the row it describes, so its
  // rows would otherwise outlive the event and resurface under a reused id.
  await deleteNames(db, "event", id)
  return c.json({ deleted: true })
})

export default events
