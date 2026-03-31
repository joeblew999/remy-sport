import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import { drizzle } from "drizzle-orm/d1"
import { eq } from "drizzle-orm"
import type { AppEnv } from "../types"
import * as schema from "../db/schema"
import { requirePermission } from "../middleware/require-permission"

const UserSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string(),
  role: z.string().nullable(),
  banned: z.boolean().nullable(),
  createdAt: z.string(),
})

const UpdateUserSchema = z.object({
  role: z.string().optional(),
  banned: z.boolean().optional(),
  banReason: z.string().optional(),
})

const ErrorSchema = z.object({ error: z.string() })

function serialize(row: typeof schema.user.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    banned: row.banned,
    createdAt: row.createdAt.toISOString(),
  }
}

const users = new OpenAPIHono<AppEnv>()

// ── GET /api/users — admin only ────────────────────────────────────────────

const listRoute = createRoute({
  method: "get",
  path: "/api/users",
  responses: {
    200: {
      description: "List all users",
      content: { "application/json": { schema: z.object({ users: z.array(UserSchema) }) } },
    },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ErrorSchema } } },
  },
  security: [{ Session: [] }, { ApiKey: [] }],
  middleware: [requirePermission("user", "manage")] as const,
})

users.openapi(listRoute, async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const rows = await db.select().from(schema.user).all()
  return c.json({ users: rows.map(serialize) })
})

// ── GET /api/users/:id — admin only ───────────────────────────────────────

const getUserRoute = createRoute({
  method: "get",
  path: "/api/users/{id}",
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: "User details", content: { "application/json": { schema: UserSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ErrorSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: ErrorSchema } } },
  },
  security: [{ Session: [] }, { ApiKey: [] }],
  middleware: [requirePermission("user", "manage")] as const,
})

users.openapi(getUserRoute, async (c) => {
  const { id } = c.req.valid("param" as never) as { id: string }
  const db = drizzle(c.env.DB, { schema })
  const row = await db.select().from(schema.user).where(eq(schema.user.id, id)).get()
  if (!row) return c.json({ error: "Not found" }, 404)
  return c.json(serialize(row), 200)
})

// ── PUT /api/users/:id — admin only (manage roles, ban/unban) ─────────────

const updateUserRoute = createRoute({
  method: "put",
  path: "/api/users/{id}",
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { "application/json": { schema: UpdateUserSchema } } },
  },
  responses: {
    200: { description: "User updated", content: { "application/json": { schema: UserSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ErrorSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: ErrorSchema } } },
  },
  security: [{ Session: [] }, { ApiKey: [] }],
  middleware: [requirePermission("user", "manage")] as const,
})

users.openapi(updateUserRoute, async (c) => {
  const { id } = c.req.valid("param" as never) as { id: string }
  const body = c.req.valid("json" as never) as z.infer<typeof UpdateUserSchema>
  const db = drizzle(c.env.DB, { schema })
  const now = new Date()

  const existing = await db.select().from(schema.user).where(eq(schema.user.id, id)).get()
  if (!existing) return c.json({ error: "Not found" }, 404)

  await db
    .update(schema.user)
    .set({ ...body, updatedAt: now })
    .where(eq(schema.user.id, id))

  const updated = await db.select().from(schema.user).where(eq(schema.user.id, id)).get()
  return c.json(serialize(updated!), 200)
})

export default users
