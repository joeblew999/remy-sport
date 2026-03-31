import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import { drizzle } from "drizzle-orm/d1"
import { eq } from "drizzle-orm"
import type { AppEnv } from "../types"
import * as schema from "../db/schema"
import { requirePermission } from "../middleware/require-permission"

const FlagSchema = z.object({
  id: z.string(), resourceType: z.string(), resourceId: z.string(),
  reason: z.string(), status: z.string(),
  createdBy: z.string(), reviewedBy: z.string().nullable(),
  createdAt: z.string(), updatedAt: z.string(),
})

const ErrorSchema = z.object({ error: z.string() })

function serialize(row: typeof schema.moderationFlag.$inferSelect) {
  return {
    id: row.id, resourceType: row.resourceType, resourceId: row.resourceId,
    reason: row.reason, status: row.status,
    createdBy: row.createdBy, reviewedBy: row.reviewedBy,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  }
}

const moderation = new OpenAPIHono<AppEnv>()

const listRoute = createRoute({
  method: "get", path: "/api/moderation",
  responses: {
    200: { description: "List moderation flags", content: { "application/json": { schema: z.object({ flags: z.array(FlagSchema) }) } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ErrorSchema } } },
  },
  security: [{ Session: [] }, { ApiKey: [] }],
  middleware: [requirePermission("moderation", "manage")] as const,
})

moderation.openapi(listRoute, async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const rows = await db.select().from(schema.moderationFlag).all()
  return c.json({ flags: rows.map(serialize) })
})

const updateRoute = createRoute({
  method: "put", path: "/api/moderation/{id}",
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { "application/json": { schema: z.object({ status: z.enum(["reviewed", "resolved"]) }) } } },
  },
  responses: {
    200: { description: "Flag updated", content: { "application/json": { schema: FlagSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ErrorSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: ErrorSchema } } },
  },
  security: [{ Session: [] }, { ApiKey: [] }],
  middleware: [requirePermission("moderation", "manage")] as const,
})

moderation.openapi(updateRoute, async (c) => {
  const user = c.get("user")!
  const { id } = c.req.valid("param" as never) as { id: string }
  const body = c.req.valid("json" as never) as { status: string }
  const db = drizzle(c.env.DB, { schema })
  const now = new Date()
  await db.update(schema.moderationFlag).set({ status: body.status, reviewedBy: user.id, updatedAt: now }).where(eq(schema.moderationFlag.id, id))
  const updated = await db.select().from(schema.moderationFlag).where(eq(schema.moderationFlag.id, id)).get()
  if (!updated) return c.json({ error: "Not found" }, 404)
  return c.json(serialize(updated), 200)
})

export default moderation
