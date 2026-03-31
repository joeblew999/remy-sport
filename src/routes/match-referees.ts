import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import { drizzle } from "drizzle-orm/d1"
import { eq } from "drizzle-orm"
import type { AppEnv } from "../types"
import * as schema from "../db/schema"
import { requirePermission } from "../middleware/require-permission"

const MatchRefereeSchema = z.object({
  id: z.string(),
  matchId: z.string(),
  userId: z.string(),
  createdAt: z.string(),
})

const AssignRefereeSchema = z.object({
  matchId: z.string().min(1),
  userId: z.string().min(1),
})

const ErrorSchema = z.object({ error: z.string() })

function serialize(row: typeof schema.matchReferee.$inferSelect) {
  return {
    id: row.id,
    matchId: row.matchId,
    userId: row.userId,
    createdAt: row.createdAt.toISOString(),
  }
}

const matchReferees = new OpenAPIHono<AppEnv>()

// ── GET /api/match-referees — public ───────────────────────────────────────

const listRoute = createRoute({
  method: "get",
  path: "/api/match-referees",
  responses: {
    200: {
      description: "List all referee assignments",
      content: { "application/json": { schema: z.object({ matchReferees: z.array(MatchRefereeSchema) }) } },
    },
  },
})

matchReferees.openapi(listRoute, async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const rows = await db.select().from(schema.matchReferee).all()
  return c.json({ matchReferees: rows.map(serialize) })
})

// ── POST /api/match-referees — requires fixture:generate (O, A) ───────────

const assignRoute = createRoute({
  method: "post",
  path: "/api/match-referees",
  request: {
    body: { content: { "application/json": { schema: AssignRefereeSchema } } },
  },
  responses: {
    201: { description: "Referee assigned", content: { "application/json": { schema: MatchRefereeSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ErrorSchema } } },
  },
  security: [{ Session: [] }, { ApiKey: [] }],
  // Assigning referees is an organizer/admin operation (fixture:generate covers this)
  middleware: [requirePermission("fixture", "generate")] as const,
})

matchReferees.openapi(assignRoute, async (c) => {
  const body = c.req.valid("json" as never) as z.infer<typeof AssignRefereeSchema>
  const db = drizzle(c.env.DB, { schema })
  const now = new Date()
  const id = crypto.randomUUID()

  const row = {
    id,
    matchId: body.matchId,
    userId: body.userId,
    createdAt: now,
  }

  await db.insert(schema.matchReferee).values(row)

  return c.json({ ...row, createdAt: now.toISOString() }, 201)
})

// ── DELETE /api/match-referees/:id — requires fixture:generate (O, A) ─────

const removeRoute = createRoute({
  method: "delete",
  path: "/api/match-referees/{id}",
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: "Referee unassigned", content: { "application/json": { schema: z.object({ deleted: z.boolean() }) } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ErrorSchema } } },
  },
  security: [{ Session: [] }, { ApiKey: [] }],
  middleware: [requirePermission("fixture", "generate")] as const,
})

matchReferees.openapi(removeRoute, async (c) => {
  const { id } = c.req.valid("param" as never) as { id: string }
  const db = drizzle(c.env.DB, { schema })
  await db.delete(schema.matchReferee).where(eq(schema.matchReferee.id, id))
  return c.json({ deleted: true })
})

export default matchReferees
