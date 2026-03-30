import { createMiddleware } from "hono/factory"
import { createAuth } from "../auth"
import type { AppEnv } from "../types"

export const sessionMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  try {
    const auth = createAuth(c)
    let session = await auth.api.getSession({
      headers: c.req.raw.headers,
    })

    // Fallback: if session not found and bearer token present, retry without
    // cookies to avoid conflict between cookie + bearer plugin double-cookie.
    if (!session) {
      const authHeader = c.req.header("Authorization")
      if (authHeader?.startsWith("Bearer ")) {
        session = await auth.api.getSession({
          headers: new Headers({ Authorization: authHeader }),
        })
      }
    }

    c.set("user", session?.user ?? null)
    c.set("session", session?.session ?? null)
  } catch {
    c.set("user", null)
    c.set("session", null)
  }

  await next()
})
