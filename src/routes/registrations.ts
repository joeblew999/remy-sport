import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import { drizzle } from "drizzle-orm/d1"
import type { AppEnv } from "../types"
import * as schema from "../db/schema"
import { requirePermission } from "../middleware/require-permission"

const RegistrationSchema = z.object({
  id: z.string(), eventId: z.string(), type: z.string(),
  teamId: z.string().nullable(), playerId: z.string().nullable(),
  status: z.string(), createdBy: z.string(),
  createdAt: z.string(), updatedAt: z.string(),
})

const RegisterTeamSchema = z.object({ eventId: z.string().min(1), teamId: z.string().min(1) })
const RegisterPlayerSchema = z.object({ eventId: z.string().min(1), playerId: z.string().min(1) })
const ErrorSchema = z.object({ error: z.string() })

function serialize(row: typeof schema.registration.$inferSelect) {
  return {
    id: row.id, eventId: row.eventId, type: row.type,
    teamId: row.teamId, playerId: row.playerId, status: row.status,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  }
}

const registrations = new OpenAPIHono<AppEnv>()

const listRoute = createRoute({
  method: "get", path: "/api/registrations",
  responses: { 200: { description: "List registrations", content: { "application/json": { schema: z.object({ registrations: z.array(RegistrationSchema) }) } } } },
})

registrations.openapi(listRoute, async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const rows = await db.select().from(schema.registration).all()
  return c.json({ registrations: rows.map(serialize) })
})

const registerTeamRoute = createRoute({
  method: "post", path: "/api/registrations/team",
  request: { body: { content: { "application/json": { schema: RegisterTeamSchema } } } },
  responses: {
    201: { description: "Team registered", content: { "application/json": { schema: RegistrationSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ErrorSchema } } },
  },
  security: [{ Session: [] }, { ApiKey: [] }],
  middleware: [requirePermission("registration", "register-team")] as const,
})

registrations.openapi(registerTeamRoute, async (c) => {
  const user = c.get("user")!
  const body = c.req.valid("json" as never) as z.infer<typeof RegisterTeamSchema>
  const db = drizzle(c.env.DB, { schema })
  const now = new Date()
  const id = crypto.randomUUID()
  const row = { id, eventId: body.eventId, type: "team" as const, teamId: body.teamId, playerId: null, status: "pending", createdBy: user.id, createdAt: now, updatedAt: now }
  await db.insert(schema.registration).values(row)
  return c.json({ ...row, createdAt: now.toISOString(), updatedAt: now.toISOString() }, 201)
})

const registerPlayerRoute = createRoute({
  method: "post", path: "/api/registrations/player",
  request: { body: { content: { "application/json": { schema: RegisterPlayerSchema } } } },
  responses: {
    201: { description: "Player registered", content: { "application/json": { schema: RegistrationSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ErrorSchema } } },
  },
  security: [{ Session: [] }, { ApiKey: [] }],
  middleware: [requirePermission("registration", "register-player")] as const,
})

registrations.openapi(registerPlayerRoute, async (c) => {
  const user = c.get("user")!
  const body = c.req.valid("json" as never) as z.infer<typeof RegisterPlayerSchema>
  const db = drizzle(c.env.DB, { schema })
  const now = new Date()
  const id = crypto.randomUUID()
  const row = { id, eventId: body.eventId, type: "player" as const, teamId: null, playerId: body.playerId, status: "pending", createdBy: user.id, createdAt: now, updatedAt: now }
  await db.insert(schema.registration).values(row)
  return c.json({ ...row, createdAt: now.toISOString(), updatedAt: now.toISOString() }, 201)
})

export default registrations
