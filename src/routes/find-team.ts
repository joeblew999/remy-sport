import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import { drizzle } from "drizzle-orm/d1"
import type { AppEnv } from "../types"
import * as schema from "../db/schema"
import { requirePermission } from "../middleware/require-permission"

const TeamResultSchema = z.object({
  id: z.string(), name: z.string(), eventId: z.string(),
  createdAt: z.string(),
})

const findTeam = new OpenAPIHono<AppEnv>()

const findTeamRoute = createRoute({
  method: "get", path: "/api/find-team",
  responses: {
    200: { description: "Teams available to join", content: { "application/json": { schema: z.object({ teams: z.array(TeamResultSchema) }) } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: z.object({ error: z.string() }) } } },
    403: { description: "Forbidden", content: { "application/json": { schema: z.object({ error: z.string() }) } } },
  },
  security: [{ Session: [] }, { ApiKey: [] }],
  middleware: [requirePermission("find-team", "read")] as const,
})

findTeam.openapi(findTeamRoute, async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const rows = await db.select().from(schema.team).all()
  return c.json({
    teams: rows.map((r) => ({
      id: r.id, name: r.name, eventId: r.eventId,
      createdAt: r.createdAt.toISOString(),
    })),
  })
})

export default findTeam
