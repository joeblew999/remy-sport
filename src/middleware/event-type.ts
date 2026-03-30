import { createMiddleware } from "hono/factory"
import { drizzle } from "drizzle-orm/d1"
import { eq } from "drizzle-orm"
import type { AppEnv } from "../types"
import * as schema from "../db/schema"

type EventType = "tournament" | "league" | "camp" | "showcase"

/**
 * Layer 3: Event type scoping.
 * Ensures the operation applies to the given event types.
 * Returns 422 (not 403) — the actor has permission, but the operation
 * doesn't apply to this event type.
 */
export function requireEventType(...types: EventType[]) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const eventId = c.req.param("eventId") || c.req.param("id")
    if (!eventId) return c.json({ error: "Missing event ID" }, 400)

    const db = drizzle(c.env.DB, { schema })
    const [event] = await db
      .select()
      .from(schema.event)
      .where(eq(schema.event.id, eventId))
      .limit(1)

    if (!event) return c.json({ error: "Event not found" }, 404)
    if (!types.includes(event.type as EventType)) {
      return c.json({ error: "Not applicable for this event type" }, 422)
    }

    await next()
  })
}
