import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import { drizzle } from "drizzle-orm/d1"
import type { AppEnv } from "../types"
import * as schema from "../db/schema"
import { requirePermission } from "../middleware/require-permission"
import { requireEventType } from "../middleware/event-type"

const AttendanceSchema = z.object({
  id: z.string(),
  campSessionId: z.string(),
  playerId: z.string(),
  present: z.boolean(),
  createdBy: z.string(),
  createdAt: z.string(),
})

const RecordAttendanceSchema = z.object({
  eventId: z.string().min(1),
  campSessionId: z.string().min(1),
  playerId: z.string().min(1),
  present: z.boolean().optional(),
})

const ErrorSchema = z.object({ error: z.string() })

function serialize(row: typeof schema.attendance.$inferSelect) {
  return {
    id: row.id,
    campSessionId: row.campSessionId,
    playerId: row.playerId,
    present: row.present,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  }
}

const attendance = new OpenAPIHono<AppEnv>()

const listRoute = createRoute({
  method: "get",
  path: "/api/attendance",
  responses: {
    200: {
      description: "List all attendance records",
      content: { "application/json": { schema: z.object({ attendance: z.array(AttendanceSchema) }) } },
    },
  },
})

attendance.openapi(listRoute, async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const rows = await db.select().from(schema.attendance).all()
  return c.json({ attendance: rows.map(serialize) })
})

const recordRoute = createRoute({
  method: "post",
  path: "/api/attendance",
  request: {
    body: { content: { "application/json": { schema: RecordAttendanceSchema } } },
  },
  responses: {
    201: { description: "Attendance recorded", content: { "application/json": { schema: AttendanceSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ErrorSchema } } },
    422: { description: "Not applicable for this event type", content: { "application/json": { schema: ErrorSchema } } },
  },
  security: [{ Session: [] }, { ApiKey: [] }],
  middleware: [requirePermission("attendance", "record"), requireEventType("camp")] as const,
})

attendance.openapi(recordRoute, async (c) => {
  const user = c.get("user")!
  const body = c.req.valid("json" as never) as z.infer<typeof RecordAttendanceSchema>
  const db = drizzle(c.env.DB, { schema })
  const now = new Date()
  const id = crypto.randomUUID()

  const row = {
    id,
    campSessionId: body.campSessionId,
    playerId: body.playerId,
    present: body.present ?? true,
    createdBy: user.id,
    createdAt: now,
  }

  await db.insert(schema.attendance).values(row)

  return c.json({ ...row, createdAt: now.toISOString() }, 201)
})

export default attendance
