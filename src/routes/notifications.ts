import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import { drizzle } from "drizzle-orm/d1"
import { eq } from "drizzle-orm"
import type { AppEnv } from "../types"
import * as schema from "../db/schema"
import { requirePermission } from "../middleware/require-permission"

const SubscriptionSchema = z.object({
  id: z.string(), userId: z.string(), eventId: z.string().nullable(),
  type: z.string(), endpoint: z.string().nullable(), enabled: z.boolean(),
  createdAt: z.string(), updatedAt: z.string(),
})

const SubscribeSchema = z.object({
  eventId: z.string().optional(), type: z.enum(["push", "email"]),
  endpoint: z.string().optional(),
})

const ErrorSchema = z.object({ error: z.string() })

function serialize(row: typeof schema.notificationSubscription.$inferSelect) {
  return {
    id: row.id, userId: row.userId, eventId: row.eventId,
    type: row.type, endpoint: row.endpoint, enabled: row.enabled,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  }
}

const notifications = new OpenAPIHono<AppEnv>()

const listRoute = createRoute({
  method: "get", path: "/api/notifications",
  responses: {
    200: { description: "List subscriptions", content: { "application/json": { schema: z.object({ subscriptions: z.array(SubscriptionSchema) }) } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ErrorSchema } } },
  },
  security: [{ Session: [] }, { ApiKey: [] }],
  middleware: [requirePermission("notifications", "read")] as const,
})

notifications.openapi(listRoute, async (c) => {
  const user = c.get("user")!
  const db = drizzle(c.env.DB, { schema })
  const rows = await db.select().from(schema.notificationSubscription).where(eq(schema.notificationSubscription.userId, user.id)).all()
  return c.json({ subscriptions: rows.map(serialize) })
})

const subscribeRoute = createRoute({
  method: "post", path: "/api/notifications/subscribe",
  request: { body: { content: { "application/json": { schema: SubscribeSchema } } } },
  responses: {
    201: { description: "Subscribed", content: { "application/json": { schema: SubscriptionSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ErrorSchema } } },
  },
  security: [{ Session: [] }, { ApiKey: [] }],
  middleware: [requirePermission("notifications", "subscribe")] as const,
})

notifications.openapi(subscribeRoute, async (c) => {
  const user = c.get("user")!
  const body = c.req.valid("json" as never) as z.infer<typeof SubscribeSchema>
  const db = drizzle(c.env.DB, { schema })
  const now = new Date()
  const id = crypto.randomUUID()
  const row = {
    id, userId: user.id, eventId: body.eventId ?? null,
    type: body.type, endpoint: body.endpoint ?? null, enabled: true,
    createdBy: user.id, createdAt: now, updatedAt: now,
  }
  await db.insert(schema.notificationSubscription).values(row)
  return c.json({ ...row, createdAt: now.toISOString(), updatedAt: now.toISOString() }, 201)
})

export default notifications
