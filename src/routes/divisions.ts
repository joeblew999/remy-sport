import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import { drizzle } from "drizzle-orm/d1"
import { eq } from "drizzle-orm"
import type { AppEnv } from "../types"
import * as schema from "../db/schema"
import { requirePermission } from "../middleware/require-permission"
import { ownedBy } from "../middleware/owned-by"

const DivisionSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  name: z.string(),
  ageGroup: z.string().nullable(),
  gender: z.string().nullable(),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const CreateDivisionSchema = z.object({
  eventId: z.string().min(1),
  name: z.string().min(1),
  ageGroup: z.string().optional(),
  gender: z.string().optional(),
})

const UpdateDivisionSchema = z.object({
  name: z.string().min(1).optional(),
  ageGroup: z.string().optional(),
  gender: z.string().optional(),
})

const ErrorSchema = z.object({ error: z.string() })

function serialize(row: typeof schema.division.$inferSelect) {
  return {
    id: row.id, eventId: row.eventId, name: row.name,
    ageGroup: row.ageGroup, gender: row.gender, createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  }
}

const divisions = new OpenAPIHono<AppEnv>()

const listRoute = createRoute({
  method: "get", path: "/api/divisions",
  responses: { 200: { description: "List divisions", content: { "application/json": { schema: z.object({ divisions: z.array(DivisionSchema) }) } } } },
})

divisions.openapi(listRoute, async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const rows = await db.select().from(schema.division).all()
  return c.json({ divisions: rows.map(serialize) })
})

const createDivisionRoute = createRoute({
  method: "post", path: "/api/divisions",
  request: { body: { content: { "application/json": { schema: CreateDivisionSchema } } } },
  responses: {
    201: { description: "Division created", content: { "application/json": { schema: DivisionSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ErrorSchema } } },
  },
  security: [{ Session: [] }, { ApiKey: [] }],
  middleware: [requirePermission("division", "create")] as const,
})

divisions.openapi(createDivisionRoute, async (c) => {
  const user = c.get("user")!
  const body = c.req.valid("json" as never) as z.infer<typeof CreateDivisionSchema>
  const db = drizzle(c.env.DB, { schema })
  const now = new Date()
  const id = crypto.randomUUID()
  const row = { id, eventId: body.eventId, name: body.name, ageGroup: body.ageGroup ?? null, gender: body.gender ?? null, createdBy: user.id, createdAt: now, updatedAt: now }
  await db.insert(schema.division).values(row)
  return c.json({ ...row, createdAt: now.toISOString(), updatedAt: now.toISOString() }, 201)
})

const updateDivisionRoute = createRoute({
  method: "put", path: "/api/divisions/{id}",
  request: { params: z.object({ id: z.string() }), body: { content: { "application/json": { schema: UpdateDivisionSchema } } } },
  responses: {
    200: { description: "Division updated", content: { "application/json": { schema: DivisionSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ErrorSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: ErrorSchema } } },
  },
  security: [{ Session: [] }, { ApiKey: [] }],
  middleware: [requirePermission("division", "update"), ownedBy(schema.division, "id")] as const,
})

divisions.openapi(updateDivisionRoute, async (c) => {
  const { id } = c.req.valid("param" as never) as { id: string }
  const body = c.req.valid("json" as never) as z.infer<typeof UpdateDivisionSchema>
  const db = drizzle(c.env.DB, { schema })
  const now = new Date()
  await db.update(schema.division).set({ ...body, updatedAt: now }).where(eq(schema.division.id, id))
  const updated = await db.select().from(schema.division).where(eq(schema.division.id, id)).get()
  if (!updated) return c.json({ error: "Not found" }, 404)
  return c.json(serialize(updated), 200)
})

const deleteDivisionRoute = createRoute({
  method: "delete", path: "/api/divisions/{id}",
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: "Deleted", content: { "application/json": { schema: z.object({ deleted: z.boolean() }) } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ErrorSchema } } },
  },
  security: [{ Session: [] }, { ApiKey: [] }],
  middleware: [requirePermission("division", "delete"), ownedBy(schema.division, "id")] as const,
})

divisions.openapi(deleteDivisionRoute, async (c) => {
  const { id } = c.req.valid("param" as never) as { id: string }
  const db = drizzle(c.env.DB, { schema })
  await db.delete(schema.division).where(eq(schema.division.id, id))
  return c.json({ deleted: true })
})

export default divisions
