import { Hono } from "hono"
import { createAuth } from "../auth"
import type { AppEnv } from "../types"

const auth = new Hono<AppEnv>()

auth.all("/api/auth/*", async (c) => {
  // `headers` so the OTP mail can read Accept-Language — the browser asking for
  // a code is the one about to read it.
  const betterAuth = createAuth({ env: c.env, req: c.req, headers: c.req.raw.headers })
  return betterAuth.handler(c.req.raw)
})

export default auth
