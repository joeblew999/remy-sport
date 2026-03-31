import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import { drizzle } from "drizzle-orm/d1"
import type { AppEnv } from "../types"
import * as schema from "../db/schema"

const CourtStatusSchema = z.object({
  courtId: z.string(), courtName: z.string(), eventId: z.string(),
  currentMatch: z.string().nullable(), status: z.string(),
})

const courtStatus = new OpenAPIHono<AppEnv>()

const listRoute = createRoute({
  method: "get", path: "/api/court-status",
  responses: { 200: { description: "Court status board", content: { "application/json": { schema: z.object({ courts: z.array(CourtStatusSchema) }) } } } },
})

courtStatus.openapi(listRoute, async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const courts = await db.select().from(schema.court).all()
  // In a full implementation, courts would have a matchId FK.
  // For now, return all courts with "available" status.
  const result = courts.map((ct) => ({
    courtId: ct.id, courtName: ct.name, eventId: ct.eventId,
    currentMatch: null, status: "available",
  }))
  return c.json({ courts: result })
})

export default courtStatus
