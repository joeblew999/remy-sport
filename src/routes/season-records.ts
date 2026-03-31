import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import { drizzle } from "drizzle-orm/d1"
import { eq } from "drizzle-orm"
import type { AppEnv } from "../types"
import * as schema from "../db/schema"

const SeasonRecordSchema = z.object({
  eventId: z.string(), eventName: z.string(),
  totalMatches: z.number(), completedMatches: z.number(),
  teamCount: z.number(),
})

const seasonRecords = new OpenAPIHono<AppEnv>()

const listRoute = createRoute({
  method: "get", path: "/api/season-records",
  responses: { 200: { description: "Season records", content: { "application/json": { schema: z.object({ records: z.array(SeasonRecordSchema) }) } } } },
})

seasonRecords.openapi(listRoute, async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const events = await db.select().from(schema.event).where(eq(schema.event.type, "league")).all()
  const matches = await db.select().from(schema.match).all()
  const teams = await db.select().from(schema.team).all()

  const records = events.map((e) => {
    const eventMatches = matches.filter((m) => m.eventId === e.id)
    const eventTeams = teams.filter((t) => t.eventId === e.id)
    return {
      eventId: e.id, eventName: e.name,
      totalMatches: eventMatches.length,
      completedMatches: eventMatches.filter((m) => m.status === "completed").length,
      teamCount: eventTeams.length,
    }
  })

  return c.json({ records })
})

export default seasonRecords
