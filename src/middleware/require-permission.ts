import { createMiddleware } from "hono/factory"
import type { AppEnv } from "../types"
import { roles } from "../auth/access-control"

type Resource = "event"
type Action = "create" | "read" | "update" | "delete"

export function requirePermission(resource: Resource, action: Action) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get("user")
    if (!user) return c.json({ error: "Unauthorized" }, 401)

    const userRole = (user.role || "user") as keyof typeof roles
    const roleDef = roles[userRole]
    if (!roleDef) return c.json({ error: "Forbidden" }, 403)

    const allowed = roleDef.authorize({ [resource]: [action] })
    if (allowed.error) return c.json({ error: "Forbidden" }, 403)

    await next()
  })
}
