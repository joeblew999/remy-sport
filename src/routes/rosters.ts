import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import { drizzle } from "drizzle-orm/d1"
import { eq } from "drizzle-orm"
import type { AppEnv } from "../types"
import * as schema from "../db/schema"
import { requirePermission } from "../middleware/require-permission"

const RosterSchema = z.object({
  id: z.string(),
  teamId: z.string(),
  playerId: z.string(),
  createdBy: z.string(),
  createdAt: z.string(),
})

const ManageRosterSchema = z.object({
  teamId: z.string().min(1),
  playerId: z.string().min(1),
})

const ErrorSchema = z.object({ error: z.string() })

function serialize(row: typeof schema.roster.$inferSelect) {
  return {
    id: row.id,
    teamId: row.teamId,
    playerId: row.playerId,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  }
}

const rosters = new OpenAPIHono<AppEnv>()

const listRoute = createRoute({
  method: "get",
  path: "/api/rosters",
  responses: {
    200: {
      description: "List all roster entries",
      content: { "application/json": { schema: z.object({ rosters: z.array(RosterSchema) }) } },
    },
  },
})

rosters.openapi(listRoute, async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const rows = await db.select().from(schema.roster).all()
  return c.json({ rosters: rows.map(serialize) })
})

const manageRoute = createRoute({
  method: "post",
  path: "/api/rosters",
  request: {
    body: { content: { "application/json": { schema: ManageRosterSchema } } },
  },
  responses: {
    201: { description: "Roster entry created", content: { "application/json": { schema: RosterSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ErrorSchema } } },
  },
  security: [{ Session: [] }, { ApiKey: [] }],
  middleware: [requirePermission("roster", "manage")] as const,
})

rosters.openapi(manageRoute, async (c) => {
  const user = c.get("user")!
  const body = c.req.valid("json" as never) as z.infer<typeof ManageRosterSchema>
  const db = drizzle(c.env.DB, { schema })
  const now = new Date()
  const id = crypto.randomUUID()

  const row = {
    id,
    teamId: body.teamId,
    playerId: body.playerId,
    createdBy: user.id,
    createdAt: now,
  }

  await db.insert(schema.roster).values(row)

  return c.json({ ...row, createdAt: now.toISOString() }, 201)
})

const deleteRoute = createRoute({
  method: "delete",
  path: "/api/rosters/{id}",
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: "Roster entry removed", content: { "application/json": { schema: z.object({ deleted: z.boolean() }) } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ErrorSchema } } },
  },
  security: [{ Session: [] }, { ApiKey: [] }],
  middleware: [requirePermission("roster", "manage")] as const,
})

rosters.openapi(deleteRoute, async (c) => {
  const { id } = c.req.valid("param" as never) as { id: string }
  const db = drizzle(c.env.DB, { schema })
  await db.delete(schema.roster).where(eq(schema.roster.id, id))
  return c.json({ deleted: true })
})

export default rosters
