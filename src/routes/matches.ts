import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import { drizzle } from "drizzle-orm/d1"
import { eq } from "drizzle-orm"
import type { AppEnv } from "../types"
import * as schema from "../db/schema"
import { requirePermission } from "../middleware/require-permission"

const MatchSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  homeTeamId: z.string().nullable(),
  awayTeamId: z.string().nullable(),
  status: z.string(),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const CreateMatchSchema = z.object({
  eventId: z.string().min(1),
  homeTeamId: z.string().optional(),
  awayTeamId: z.string().optional(),
})

const MatchStatusSchema = z.enum(["scheduled", "in_progress", "half_time", "completed"])

const UpdateMatchStatusSchema = z.object({
  status: MatchStatusSchema,
})

const ErrorSchema = z.object({ error: z.string() })

function serialize(row: typeof schema.match.$inferSelect) {
  return {
    id: row.id,
    eventId: row.eventId,
    homeTeamId: row.homeTeamId,
    awayTeamId: row.awayTeamId,
    status: row.status,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

const matches = new OpenAPIHono<AppEnv>()

const listRoute = createRoute({
  method: "get",
  path: "/api/matches",
  responses: {
    200: {
      description: "List all matches",
      content: { "application/json": { schema: z.object({ matches: z.array(MatchSchema) }) } },
    },
  },
})

matches.openapi(listRoute, async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const rows = await db.select().from(schema.match).all()
  return c.json({ matches: rows.map(serialize) })
})

const createRoute2 = createRoute({
  method: "post",
  path: "/api/matches",
  request: {
    body: { content: { "application/json": { schema: CreateMatchSchema } } },
  },
  responses: {
    201: { description: "Match created", content: { "application/json": { schema: MatchSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ErrorSchema } } },
  },
  security: [{ Session: [] }, { ApiKey: [] }],
  // Matches are created by organizers (fixture:generate permission covers this)
  middleware: [requirePermission("fixture", "generate")] as const,
})

matches.openapi(createRoute2, async (c) => {
  const user = c.get("user")!
  const body = c.req.valid("json" as never) as z.infer<typeof CreateMatchSchema>
  const db = drizzle(c.env.DB, { schema })
  const now = new Date()
  const id = crypto.randomUUID()

  const row = {
    id,
    eventId: body.eventId,
    homeTeamId: body.homeTeamId ?? null,
    awayTeamId: body.awayTeamId ?? null,
    status: "scheduled",
    scheduledAt: null,
    createdBy: user.id,
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(schema.match).values(row)

  return c.json(
    { ...serialize({ ...row, scheduledAt: null }) },
    201,
  )
})

// ── GET /api/matches/:id — public ──────────────────────────────────────────

const getMatchRoute = createRoute({
  method: "get",
  path: "/api/matches/{id}",
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: "Match details", content: { "application/json": { schema: MatchSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: ErrorSchema } } },
  },
})

matches.openapi(getMatchRoute, async (c) => {
  const { id } = c.req.valid("param")
  const db = drizzle(c.env.DB, { schema })
  const row = await db.select().from(schema.match).where(eq(schema.match.id, id)).get()
  if (!row) return c.json({ error: "Not found" }, 404)
  return c.json(serialize(row), 200)
})

// ── PUT /api/matches/:id/status — confirm match status (O, R, A) ──────────

const updateMatchStatusRoute = createRoute({
  method: "put",
  path: "/api/matches/{id}/status",
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { "application/json": { schema: UpdateMatchStatusSchema } } },
  },
  responses: {
    200: { description: "Match status updated", content: { "application/json": { schema: MatchSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ErrorSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: ErrorSchema } } },
  },
  security: [{ Session: [] }, { ApiKey: [] }],
  // score:enter permission covers match status confirmation (O, R, A per matrix)
  middleware: [requirePermission("score", "enter")] as const,
})

matches.openapi(updateMatchStatusRoute, async (c) => {
  const { id } = c.req.valid("param" as never) as { id: string }
  const body = c.req.valid("json" as never) as z.infer<typeof UpdateMatchStatusSchema>
  const db = drizzle(c.env.DB, { schema })
  const now = new Date()

  const existing = await db.select().from(schema.match).where(eq(schema.match.id, id)).get()
  if (!existing) return c.json({ error: "Not found" }, 404)

  await db
    .update(schema.match)
    .set({ status: body.status, updatedAt: now })
    .where(eq(schema.match.id, id))

  const updated = await db.select().from(schema.match).where(eq(schema.match.id, id)).get()
  return c.json(serialize(updated!), 200)
})

export default matches
