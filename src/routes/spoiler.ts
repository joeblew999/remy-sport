import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import { drizzle } from "drizzle-orm/d1"
import { eq } from "drizzle-orm"
import type { AppEnv } from "../types"
import * as schema from "../db/schema"
import { requirePermission } from "../middleware/require-permission"

const SpoilerSchema = z.object({ enabled: z.boolean() })
const ErrorSchema = z.object({ error: z.string() })

const spoiler = new OpenAPIHono<AppEnv>()

const getRoute = createRoute({
  method: "get", path: "/api/preferences/spoiler",
  responses: {
    200: { description: "Spoiler preference", content: { "application/json": { schema: SpoilerSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ErrorSchema } } },
  },
  security: [{ Session: [] }, { ApiKey: [] }],
  middleware: [requirePermission("spoiler", "read")] as const,
})

spoiler.openapi(getRoute, async (c) => {
  const user = c.get("user")!
  const db = drizzle(c.env.DB, { schema })
  const pref = await db.select().from(schema.spoilerPreference).where(eq(schema.spoilerPreference.userId, user.id)).get()
  return c.json({ enabled: pref?.enabled ?? true })
})

const toggleRoute = createRoute({
  method: "put", path: "/api/preferences/spoiler",
  request: { body: { content: { "application/json": { schema: z.object({ enabled: z.boolean() }) } } } },
  responses: {
    200: { description: "Spoiler preference updated", content: { "application/json": { schema: SpoilerSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ErrorSchema } } },
  },
  security: [{ Session: [] }, { ApiKey: [] }],
  middleware: [requirePermission("spoiler", "toggle")] as const,
})

spoiler.openapi(toggleRoute, async (c) => {
  const user = c.get("user")!
  const body = c.req.valid("json" as never) as { enabled: boolean }
  const db = drizzle(c.env.DB, { schema })
  const now = new Date()
  const existing = await db.select().from(schema.spoilerPreference).where(eq(schema.spoilerPreference.userId, user.id)).get()

  if (existing) {
    await db.update(schema.spoilerPreference).set({ enabled: body.enabled, updatedAt: now }).where(eq(schema.spoilerPreference.id, existing.id))
  } else {
    await db.insert(schema.spoilerPreference).values({
      id: crypto.randomUUID(), userId: user.id, enabled: body.enabled, createdAt: now, updatedAt: now,
    })
  }

  return c.json({ enabled: body.enabled })
})

export default spoiler
