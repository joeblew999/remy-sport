import { Hono } from "hono"
import { createAuth } from "../auth"
import type { AppEnv } from "../types"

const SEED_USERS = [
  { email: "admin@remy.dev", password: "admin1234!", name: "Admin" },
  { email: "user@remy.dev", password: "user12345!", name: "User" },
]

const seed = new Hono<AppEnv>()

seed.post("/api/seed", async (c) => {
  const auth = createAuth(c)
  const results: { email: string; status: string }[] = []

  for (const u of SEED_USERS) {
    try {
      // Try sign-up first
      const res = await auth.api.signUpEmail({ body: u })
      results.push({ email: u.email, status: "created" })
    } catch {
      // Already exists — that's fine (idempotent)
      results.push({ email: u.email, status: "exists" })
    }
  }

  return c.json({ seeded: results })
})

export default seed
