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
// `as const` so each role narrows to its literal. Better Auth now types
// createUser's role against the six roles in access-control.ts (ADR 007 §1),
// so a typo here is a compile error rather than a runtime 403.
] as const

const seed = new Hono<AppEnv>()

seed.post("/api/seed", async (c) => {
  const auth = createAuth(c)
  const results: { email: string; role: string; status: string }[] = []

  // createUser (admin plugin) rather than signUpEmail, because it accepts the
  // role directly — `role` is deliberately not a sign-up input in Better Auth.
  // This replaces a raw `UPDATE user SET role = ?` against Better Auth's own
  // table, which sidestepped its hooks and validation (ADR 007 §3).
  //
  // Called with no headers on purpose: the endpoint requires an admin session
  // only when invoked over HTTP (`if (!session && (ctx.request || ctx.headers))
  // throw UNAUTHORIZED`), so a direct server-side call is trusted. That is what
  // resolves the bootstrap problem — seeding the first admin needs no admin.
  for (const u of SEED_USERS) {
    try {
      await auth.api.createUser({
        body: { email: u.email, password: u.password, name: u.name, role: u.role },
      })
      results.push({ email: u.email, role: u.role, status: "created" })
    } catch {
      results.push({ email: u.email, role: u.role, status: "exists" })
    }
  }

  return c.json({ seeded: results })
})

export default seed
