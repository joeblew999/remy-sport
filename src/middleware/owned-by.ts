import { createMiddleware } from "hono/factory"
import { drizzle } from "drizzle-orm/d1"
import { eq } from "drizzle-orm"
import type { AppEnv } from "../types"
import type { SQLiteTable } from "drizzle-orm/sqlite-core"
import * as schema from "../db/schema"

/**
 * Layer 2: Resource ownership check.
 * Verifies the current user owns the resource (created_by === user.id).
 * Admins bypass ownership checks.
 */
export function ownedBy(table: SQLiteTable, idParam: string) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get("user")
    if (!user) return c.json({ error: "Unauthorized" }, 401)

    // Admins bypass ownership
    if (user.role === "admin") return next()

    const db = drizzle(c.env.DB, { schema })
    const id = c.req.param(idParam)
    if (!id) return c.json({ error: "Missing resource ID" }, 400)

    const [row] = await db.select().from(table).where(eq((table as any).id, id)).limit(1)
    if (!row) return c.json({ error: "Not found" }, 404)

    if ((row as any).createdBy !== user.id) {
      return c.json({ error: "Forbidden" }, 403)
    }

    await next()
  })
}
