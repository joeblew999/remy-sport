import { createMiddleware } from "hono/factory"
import { createAuth } from "../auth"
import type { AppEnv } from "../types"

export const sessionMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  try {
    const auth = createAuth(c)
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    })
    c.set("user", session?.user ?? null)
    c.set("session", session?.session ?? null)
  } catch {
    c.set("user", null)
    c.set("session", null)
  }

  await next()
})
