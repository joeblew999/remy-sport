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

export default matches
