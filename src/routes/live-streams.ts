import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import { drizzle } from "drizzle-orm/d1"
import type { AppEnv } from "../types"
import * as schema from "../db/schema"
import { requirePermission } from "../middleware/require-permission"

const LiveStreamSchema = z.object({
  id: z.string(), eventId: z.string(), title: z.string(), url: z.string(),
  createdBy: z.string(), createdAt: z.string(), updatedAt: z.string(),
})

const CreateSchema = z.object({ eventId: z.string().min(1), title: z.string().min(1), url: z.string().min(1) })
const ErrorSchema = z.object({ error: z.string() })

function serialize(row: typeof schema.liveStream.$inferSelect) {
  return {
    id: row.id, eventId: row.eventId, title: row.title, url: row.url,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  }
}

const liveStreams = new OpenAPIHono<AppEnv>()

const listRoute = createRoute({
  method: "get", path: "/api/live-streams",
  responses: { 200: { description: "List live streams", content: { "application/json": { schema: z.object({ liveStreams: z.array(LiveStreamSchema) }) } } } },
})

liveStreams.openapi(listRoute, async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const rows = await db.select().from(schema.liveStream).all()
  return c.json({ liveStreams: rows.map(serialize) })
})

const createRoute_ = createRoute({
  method: "post", path: "/api/live-streams",
  request: { body: { content: { "application/json": { schema: CreateSchema } } } },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: LiveStreamSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ErrorSchema } } },
  },
  security: [{ Session: [] }, { ApiKey: [] }],
  middleware: [requirePermission("live-stream", "manage")] as const,
})

liveStreams.openapi(createRoute_, async (c) => {
  const user = c.get("user")!
  const body = c.req.valid("json" as never) as z.infer<typeof CreateSchema>
  const db = drizzle(c.env.DB, { schema })
  const now = new Date()
  const id = crypto.randomUUID()
  const row = { id, eventId: body.eventId, title: body.title, url: body.url, createdBy: user.id, createdAt: now, updatedAt: now }
  await db.insert(schema.liveStream).values(row)
  return c.json({ ...row, createdAt: now.toISOString(), updatedAt: now.toISOString() }, 201)
})

export default liveStreams
