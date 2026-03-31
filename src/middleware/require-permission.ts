import { createMiddleware } from "hono/factory"
import type { AppEnv } from "../types"
import { roles } from "../auth/access-control.gen"

export function requirePermission(resource: string, action: string) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get("user")
    if (!user) return c.json({ error: "Unauthorized" }, 401)

    const userRole = (user.role || "user") as keyof typeof roles
    const roleDef = roles[userRole]
    if (!roleDef) return c.json({ error: "Forbidden" }, 403)

    const result = (roleDef.authorize as Function)({ [resource]: [action] })
    if (result.error) return c.json({ error: "Forbidden" }, 403)

    await next()
  })
}
