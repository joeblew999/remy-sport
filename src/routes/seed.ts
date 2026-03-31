import { Hono } from "hono"
import { drizzle } from "drizzle-orm/d1"
import { createAuth } from "../auth"
import type { AppEnv } from "../types"
import * as schema from "../db/schema"

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

  // Create API keys for admin and organizer (idempotent — skip if exists)
  const apiKeys: { email: string; key?: string }[] = []
  for (const email of ["admin@remy.dev", "organizer@remy.dev"]) {
    const existing = await db
      .prepare("SELECT id FROM apikey WHERE user_id = (SELECT id FROM user WHERE email = ?)")
      .bind(email)
      .first()
    if (existing) {
      apiKeys.push({ email })
      continue
    }
    try {
      // Sign in to get a session, then create API key
      const session = await auth.api.signInEmail({
        body: { email, password: SEED_USERS.find((u) => u.email === email)!.password },
      })
      const result = await auth.api.createApiKey({
        body: { name: `${email.split("@")[0]}-dev-key` },
        headers: new Headers({ Authorization: `Bearer ${session.token}` }),
      })
      apiKeys.push({ email, key: (result as any).key })
    } catch {
      apiKeys.push({ email })
    }
  }

  // ── Seed sample data (idempotent) ─────────────────────────────────────
  const orm = drizzle(db, { schema })
  const existingEvents = await orm.select().from(schema.event).all()
  if (existingEvents.length === 0) {
    const now = new Date()
    const adminUser = await db.prepare("SELECT id FROM user WHERE email = 'admin@remy.dev'").first<{ id: string }>()
    const adminId = adminUser?.id || "seed-admin"

    // Events
    const eventIds = { tournament: crypto.randomUUID(), league: crypto.randomUUID(), camp: crypto.randomUUID() }
    await orm.insert(schema.event).values([
      { id: eventIds.tournament, name: "Summer Classic", type: "tournament", createdBy: adminId, createdAt: now, updatedAt: now },
      { id: eventIds.league, name: "Spring League", type: "league", createdBy: adminId, createdAt: now, updatedAt: now },
      { id: eventIds.camp, name: "Skills Camp", type: "camp", createdBy: adminId, createdAt: now, updatedAt: now },
    ])

    // Teams
    const teamIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()]
    await orm.insert(schema.team).values([
      { id: teamIds[0], name: "Hawks", eventId: eventIds.tournament, createdBy: adminId, createdAt: now, updatedAt: now },
      { id: teamIds[1], name: "Eagles", eventId: eventIds.tournament, createdBy: adminId, createdAt: now, updatedAt: now },
      { id: teamIds[2], name: "Wolves", eventId: eventIds.league, createdBy: adminId, createdAt: now, updatedAt: now },
      { id: teamIds[3], name: "Bears", eventId: eventIds.league, createdBy: adminId, createdAt: now, updatedAt: now },
    ])

    // Players
    const playerIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()]
    await orm.insert(schema.playerProfile).values([
      { id: playerIds[0], name: "Alex Johnson", position: "Guard", createdBy: adminId, createdAt: now, updatedAt: now },
      { id: playerIds[1], name: "Jordan Smith", position: "Forward", createdBy: adminId, createdAt: now, updatedAt: now },
      { id: playerIds[2], name: "Casey Brown", position: "Center", createdBy: adminId, createdAt: now, updatedAt: now },
      { id: playerIds[3], name: "Riley Davis", position: "Guard", createdBy: adminId, createdAt: now, updatedAt: now },
    ])

    // Rosters
    await orm.insert(schema.roster).values([
      { id: crypto.randomUUID(), teamId: teamIds[0], playerId: playerIds[0], createdBy: adminId, createdAt: now, updatedAt: now },
      { id: crypto.randomUUID(), teamId: teamIds[0], playerId: playerIds[1], createdBy: adminId, createdAt: now, updatedAt: now },
      { id: crypto.randomUUID(), teamId: teamIds[1], playerId: playerIds[2], createdBy: adminId, createdAt: now, updatedAt: now },
      { id: crypto.randomUUID(), teamId: teamIds[1], playerId: playerIds[3], createdBy: adminId, createdAt: now, updatedAt: now },
    ])

    // Matches
    const matchIds = [crypto.randomUUID(), crypto.randomUUID()]
    await orm.insert(schema.match).values([
      { id: matchIds[0], eventId: eventIds.tournament, homeTeamId: teamIds[0], awayTeamId: teamIds[1], status: "completed", createdBy: adminId, createdAt: now, updatedAt: now },
      { id: matchIds[1], eventId: eventIds.league, homeTeamId: teamIds[2], awayTeamId: teamIds[3], status: "in_progress", createdBy: adminId, createdAt: now, updatedAt: now },
    ])

    // Scores
    await orm.insert(schema.score).values([
      { id: crypto.randomUUID(), matchId: matchIds[0], homeScore: 78, awayScore: 72, enteredBy: adminId, createdAt: now, updatedAt: now },
      { id: crypto.randomUUID(), matchId: matchIds[1], homeScore: 45, awayScore: 48, enteredBy: adminId, createdAt: now, updatedAt: now },
    ])

    // Courts
    await orm.insert(schema.court).values([
      { id: crypto.randomUUID(), name: "Court A", eventId: eventIds.tournament, createdBy: adminId, createdAt: now, updatedAt: now },
      { id: crypto.randomUUID(), name: "Court B", eventId: eventIds.tournament, createdBy: adminId, createdAt: now, updatedAt: now },
    ])

    // Divisions
    await orm.insert(schema.division).values([
      { id: crypto.randomUUID(), eventId: eventIds.tournament, name: "U14 Boys", ageGroup: "U14", gender: "male", createdBy: adminId, createdAt: now, updatedAt: now },
      { id: crypto.randomUUID(), eventId: eventIds.tournament, name: "U16 Girls", ageGroup: "U16", gender: "female", createdBy: adminId, createdAt: now, updatedAt: now },
    ])

    // Sessions (for camp)
    await orm.insert(schema.campSession).values([
      { id: crypto.randomUUID(), eventId: eventIds.camp, name: "Morning Drills", createdBy: adminId, createdAt: now, updatedAt: now },
      { id: crypto.randomUUID(), eventId: eventIds.camp, name: "Afternoon Scrimmage", createdBy: adminId, createdAt: now, updatedAt: now },
    ])
  }

  return c.json({ seeded: results, apiKeys })
})

export default seed
