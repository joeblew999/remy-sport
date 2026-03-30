import { Hono } from "hono"
import { createAuth } from "../auth"
import type { AppEnv } from "../types"

const SEED_USERS = [
  { email: "admin@remy.dev", password: "admin1234!", name: "Admin", role: "admin" },
  { email: "organizer@remy.dev", password: "organizer1!", name: "Organizer", role: "organizer" },
  { email: "coach@remy.dev", password: "coach12345!", name: "Coach", role: "coach" },
  { email: "player@remy.dev", password: "player1234!", name: "Player", role: "player" },
  { email: "spectator@remy.dev", password: "spectator1!", name: "Spectator", role: "spectator" },
  { email: "referee@remy.dev", password: "referee1234!", name: "Referee", role: "referee" },
]

const seed = new Hono<AppEnv>()

seed.post("/api/seed", async (c) => {
  const auth = createAuth(c)
  const results: { email: string; role: string; status: string }[] = []

  for (const u of SEED_USERS) {
    try {
      await auth.api.signUpEmail({ body: { email: u.email, password: u.password, name: u.name } })
      results.push({ email: u.email, role: u.role, status: "created" })
    } catch {
      results.push({ email: u.email, role: u.role, status: "exists" })
    }
  }

  // Set roles directly in D1 (admin plugin's setRole requires an admin session)
  const db = c.env.DB
  for (const u of SEED_USERS) {
    await db.prepare("UPDATE user SET role = ? WHERE email = ?").bind(u.role, u.email).run()
  }

  return c.json({ seeded: results })
})

export default seed
