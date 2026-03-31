import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import { drizzle } from "drizzle-orm/d1"
import { eq } from "drizzle-orm"
import type { AppEnv } from "../types"
import * as schema from "../db/schema"
import { requirePermission } from "../middleware/require-permission"
import { ownedBy } from "../middleware/owned-by"

const TeamSchema = z.object({
  id: z.string(),
  name: z.string(),
  eventId: z.string(),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const CreateTeamSchema = z.object({
  name: z.string().min(1),
  eventId: z.string().min(1),
})

const UpdateTeamSchema = z.object({
  name: z.string().min(1).optional(),
})

const ErrorSchema = z.object({ error: z.string() })

function serializeTeam(row: typeof schema.team.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    eventId: row.eventId,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

const teams = new OpenAPIHono<AppEnv>()

// ── GET /api/teams — public, list all teams ────────────────────────────────

const listTeamsRoute = createRoute({
  method: "get",
  path: "/api/teams",
  responses: {
    200: {
      description: "List all teams",
      content: { "application/json": { schema: z.object({ teams: z.array(TeamSchema) }) } },
    },
  },
})

teams.openapi(listTeamsRoute, async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const rows = await db.select().from(schema.team).all()
  return c.json({ teams: rows.map(serializeTeam) })
})

// ── GET /api/teams/:id — public, get single team ──────────────────────────

const getTeamRoute = createRoute({
  method: "get",
  path: "/api/teams/{id}",
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      description: "Team details",
      content: { "application/json": { schema: TeamSchema } },
    },
    404: { description: "Not found", content: { "application/json": { schema: ErrorSchema } } },
  },
})

teams.openapi(getTeamRoute, async (c) => {
  const { id } = c.req.valid("param")
  const db = drizzle(c.env.DB, { schema })
  const row = await db.select().from(schema.team).where(eq(schema.team.id, id)).get()
  if (!row) return c.json({ error: "Not found" }, 404)
  return c.json(serializeTeam(row), 200)
})

// ── POST /api/teams — requires team:create ─────────────────────────────────

const createTeamRoute = createRoute({
  method: "post",
  path: "/api/teams",
  request: {
    body: { content: { "application/json": { schema: CreateTeamSchema } } },
  },
  responses: {
    201: {
      description: "Team created",
      content: { "application/json": { schema: TeamSchema } },
    },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ErrorSchema } } },
  },
  security: [{ Session: [] }, { ApiKey: [] }],
  middleware: [
    requirePermission("team", "create"),
  ] as const,
})

teams.openapi(createTeamRoute, async (c) => {
  const user = c.get("user")!
  const body = c.req.valid("json" as never) as z.infer<typeof CreateTeamSchema>
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

  await db.insert(schema.team).values(row)

  return c.json(
    {
      ...row,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    201,
  )
})

// ── PUT /api/teams/:id — requires team:update + ownership ──────────────────

const updateTeamRoute = createRoute({
  method: "put",
  path: "/api/teams/{id}",
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { "application/json": { schema: UpdateTeamSchema } } },
  },
  responses: {
    200: {
      description: "Team updated",
      content: { "application/json": { schema: TeamSchema } },
    },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ErrorSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: ErrorSchema } } },
  },
  security: [{ Session: [] }, { ApiKey: [] }],
  middleware: [
    requirePermission("team", "update"),
    ownedBy(schema.team, "id"),
  ] as const,
})

teams.openapi(updateTeamRoute, async (c) => {
  const { id } = c.req.valid("param" as never) as { id: string }
  const body = c.req.valid("json" as never) as z.infer<typeof UpdateTeamSchema>
  const db = drizzle(c.env.DB, { schema })
  const now = new Date()

  await db
    .update(schema.team)
    .set({ ...body, updatedAt: now })
    .where(eq(schema.team.id, id))

  const updated = await db.select().from(schema.team).where(eq(schema.team.id, id)).get()
  if (!updated) return c.json({ error: "Not found" }, 404)
  return c.json(serializeTeam(updated), 200)
})

// ── DELETE /api/teams/:id — requires team:delete + ownership ───────────────

const deleteTeamRoute = createRoute({
  method: "delete",
  path: "/api/teams/{id}",
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: { description: "Team deleted", content: { "application/json": { schema: z.object({ deleted: z.boolean() }) } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ErrorSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: ErrorSchema } } },
  },
  security: [{ Session: [] }, { ApiKey: [] }],
  middleware: [
    requirePermission("team", "delete"),
    ownedBy(schema.team, "id"),
  ] as const,
})

teams.openapi(deleteTeamRoute, async (c) => {
  const { id } = c.req.valid("param" as never) as { id: string }
  const db = drizzle(c.env.DB, { schema })
  await db.delete(schema.team).where(eq(schema.team.id, id))
  return c.json({ deleted: true })
})

export default teams
