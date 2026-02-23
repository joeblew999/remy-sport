import { Hono } from "hono"
import { createAuth } from "../auth"
import type { AppEnv } from "../types"

const auth = new Hono<AppEnv>()

auth.all("/api/auth/*", async (c) => {
  const betterAuth = createAuth(c)
  return betterAuth.handler(c.req.raw)
})

export default auth
