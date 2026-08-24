import { Hono } from "hono"
import { drizzle } from "drizzle-orm/d1"
import { and, eq } from "drizzle-orm"
import { createAuth } from "../auth"
import * as schema from "../db/schema"
import type { AppEnv } from "../types"

// Passwords are gone (ADR 012). These used to be committed here — real,
// working credentials for an admin account, seeded into production by
// `seed:remote`. Sign-in is now by emailed code.
const SEED_USERS = [
  { email: "admin@remy.dev", name: "Admin", role: "admin" },
  { email: "organizer@remy.dev", name: "Organizer", role: "organizer" },
  { email: "coach@remy.dev", name: "Coach", role: "coach" },
  { email: "player@remy.dev", name: "Player", role: "player" },
  { email: "spectator@remy.dev", name: "Spectator", role: "spectator" },
  { email: "referee@remy.dev", name: "Referee", role: "referee" },
// `as const` so each role narrows to its literal. Better Auth now types
// createUser's role against the six roles in access-control.ts (ADR 007 §1),
// so a typo here is a compile error rather than a runtime 403.
] as const

/**
 * Events, copied from the Product Owner's own fixtures in
 * remy-sport-biz/data/seed/events.jsonl — the same four rows, so local data
 * matches what the PO defined rather than being invented here (ADR 008).
 *
 * `id` keeps the canonical `evt_` prefix. `type` is lowercased to match the
 * OpenAPI enum this repo already exposes; migration 0005 records why that delta
 * stands. `organizer_user_id`/`org_id` are resolved to the seeded organizer
 * below, since this repo has no `users`/`orgs` fixture tables to point at.
 */
const SEED_EVENTS = [
  {
    id: "evt_001",
    name: "Sponsor Thailand Basketball League 2026 — Bangkok Round",
    nameTh: "การแข่งขัน Sponsor Thailand Basketball League 2026 รอบกรุงเทพ",
    type: "tournament",
    format: "5x5",
    startDate: "2026-06-10",
    endDate: "2026-06-15",
    city: "Bangkok",
    provinceCode: "BKK",
    isFibaCertified: false,
  },
  {
    id: "evt_002",
    name: "Bangkok Schools Basketball League 2026",
    nameTh: "ลีกบาสเกตบอลโรงเรียนกรุงเทพ ฤดูกาล 2026",
    type: "league",
    format: "5x5",
    startDate: "2026-05-01",
    endDate: "2026-09-30",
    city: "Bangkok",
    provinceCode: "BKK",
    isFibaCertified: false,
  },
  {
    id: "evt_003",
    name: "Chiang Mai Summer Basketball Camp 2026",
    nameTh: "ค่ายฝึกบาสเกตบอลภาคฤดูร้อน เชียงใหม่ 2026",
    type: "camp",
    format: "5x5",
    startDate: "2026-04-15",
    endDate: "2026-04-19",
    city: "Chiang Mai",
    provinceCode: "CMI",
    isFibaCertified: false,
  },
  {
    id: "evt_004",
    name: "Thailand Basketball Showcase 2026",
    nameTh: "การโชว์ผู้เล่นบาสเกตบอลประเทศไทย 2026",
    type: "showcase",
    format: "5x5",
    startDate: "2026-08-01",
    endDate: "2026-08-02",
    city: "Bangkok",
    provinceCode: "BKK",
    isFibaCertified: true,
  },
] as const

/**
 * Organisations and teams, copied from the Product Owner's fixtures in
 * remy-sport-biz/data/seed/orgs.jsonl and teams.jsonl (ADR 008).
 *
 * Only the three orgs the seeded teams belong to are created — the federation
 * and club rows in the biz file have no teams, so seeding them would put rows
 * on screen that nothing links to.
 */
const SEED_ORGS = [
  // biz org_001
  { name: "Assumption College", nameTh: "โรงเรียนอัสสัมชัญ", slug: "assumption-college", orgTypeCode: "SCHOOL", city: "Bangkok", provinceCode: "BKK" },
  // biz org_002
  { name: "Triam Udom Suksa School", nameTh: "โรงเรียนเตรียมอุดมศึกษา", slug: "triam-udom-suksa", orgTypeCode: "SCHOOL", city: "Bangkok", provinceCode: "BKK" },
  // biz org_003
  { name: "Montfort College", nameTh: "โรงเรียนมงฟอร์ตวิทยาลัย", slug: "montfort-college", orgTypeCode: "SCHOOL", city: "Chiang Mai", provinceCode: "CMI" },
] as const

/**
 * Teams reference their org by **slug**, not by the biz fixture's `org_id`.
 *
 * Better Auth generates the organization's primary key itself, and its
 * `member` rows point at that generated id. Rewriting the id to match the biz
 * fixture would orphan the membership created alongside it. The slug is unique,
 * stable, and the one field both sides agree on, so it is the join key here.
 */
const SEED_TEAMS = [
  { id: "team_001", name: "Assumption College U16 Boys", nameTh: "ทีมบาสเกตบอลอัสสัมชัญ U16 ชาย", orgSlug: "assumption-college", ageGroupCode: "U16", genderCode: "M" },
  { id: "team_002", name: "Triam Udom U18 Girls", nameTh: "ทีมบาสเกตบอลเตรียมอุดมศึกษา U18 หญิง", orgSlug: "triam-udom-suksa", ageGroupCode: "U18", genderCode: "F" },
  { id: "team_003", name: "Montfort U16 Boys", nameTh: "ทีมบาสเกตบอลมงฟอร์ต U16 ชาย", orgSlug: "montfort-college", ageGroupCode: "U16", genderCode: "M" },
  { id: "team_004", name: "Assumption College U18 Boys", nameTh: "ทีมบาสเกตบอลอัสสัมชัญ U18 ชาย", orgSlug: "assumption-college", ageGroupCode: "U18", genderCode: "M" },
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
        // No password: emailAndPassword is off (ADR 012) and `password` is
        // optional on createUser since 1.5. These accounts sign in by code.
        body: { email: u.email, name: u.name, role: u.role },
      })
      results.push({ email: u.email, role: u.role, status: "created" })
    } catch {
      results.push({ email: u.email, role: u.role, status: "exists" })
    }
  }

  // Events are owned by the seeded organizer — `created_by` is a real FK to
  // user.id, so this has to run after the users exist.
  const db = drizzle(c.env.DB, { schema })
  const organizer = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, "organizer@remy.dev"))
    .get()

  // Organisations, then teams — team.org_id is a real FK.
  //
  // Created through Better Auth's own API rather than an INSERT, for the reason
  // ADR 007 §3 gives about roles: a raw write to a Better Auth table sidesteps
  // its hooks and its idea of what a valid organization is. The owner is the
  // seeded admin, so the org has a member from the start.
  const orgs: { slug: string; status: string }[] = []
  const admin = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, "admin@remy.dev"))
    .get()

  if (admin) {
    for (const o of SEED_ORGS) {
      const exists = await db
        .select({ id: schema.organization.id })
        .from(schema.organization)
        .where(eq(schema.organization.slug, o.slug))
        .get()
      if (exists) {
        orgs.push({ slug: o.slug, status: "exists" })
        continue
      }
      try {
        await auth.api.createOrganization({
          body: {
            name: o.name,
            slug: o.slug,
            userId: admin.id,
            nameTh: o.nameTh,
            orgTypeCode: o.orgTypeCode,
            city: o.city,
            provinceCode: o.provinceCode,
          },
        })
        orgs.push({ slug: o.slug, status: "created" })
      } catch {
        orgs.push({ slug: o.slug, status: "failed" })
      }
    }
  }

  // Org membership. Without it the team write path is unreachable: a coach has
  // the platform-wide "team:update" permission but no relation to any specific
  // school, which is exactly the distinction requireOrgMember enforces (ADR 009).
  //
  // Coach joins Assumption College as an `admin` so the seeded data exercises
  // both write tiers — member-level create/update and admin-level delete.
  // Organizer joins Triam Udom as a plain `member`, which gives the tests a
  // user who *is* in an org but must still be refused the delete.
  const MEMBERSHIPS = [
    { email: "coach@remy.dev", slug: "assumption-college", role: "admin" },
    { email: "organizer@remy.dev", slug: "triam-udom-suksa", role: "member" },
  ] as const

  const members: { email: string; slug: string; status: string }[] = []
  for (const m of MEMBERSHIPS) {
    const u = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, m.email))
      .get()
    const org = await db
      .select({ id: schema.organization.id })
      .from(schema.organization)
      .where(eq(schema.organization.slug, m.slug))
      .get()
    if (!u || !org) {
      members.push({ ...m, status: "skipped: user or org missing" })
      continue
    }
    const already = await db
      .select({ id: schema.member.id })
      .from(schema.member)
      .where(and(eq(schema.member.userId, u.id), eq(schema.member.organizationId, org.id)))
      .get()
    if (already) {
      members.push({ ...m, status: "exists" })
      continue
    }
    try {
      // auth.api, not a raw INSERT — same reason as createOrganization above
      // (ADR 007 §3). addMember maintains whatever the plugin expects to be
      // true alongside the row.
      await auth.api.addMember({
        body: { userId: u.id, organizationId: org.id, role: m.role },
      })
      members.push({ ...m, status: "created" })
    } catch {
      members.push({ ...m, status: "failed" })
    }
  }

  const teams: { id: string; status: string }[] = []
  const teamNow = new Date()
  for (const t of SEED_TEAMS) {
    const org = await db
      .select({ id: schema.organization.id })
      .from(schema.organization)
      .where(eq(schema.organization.slug, t.orgSlug))
      .get()
    if (!org) {
      teams.push({ id: t.id, status: "skipped: org missing" })
      continue
    }
    const { orgSlug: _orgSlug, ...cols } = t
    const res = await db
      .insert(schema.team)
      .values({ ...cols, orgId: org.id, createdAt: teamNow, updatedAt: teamNow })
      .onConflictDoNothing()
    teams.push({ id: t.id, status: res.meta.changes > 0 ? "created" : "exists" })
  }

  const events: { id: string; status: string }[] = []
  if (organizer) {
    const now = new Date()
    for (const e of SEED_EVENTS) {
      // onConflictDoNothing keeps /api/seed idempotent, matching the user loop
      // above — re-seeding must not duplicate or clobber edited rows.
      const res = await db
        .insert(schema.event)
        .values({ ...e, description: null, createdBy: organizer.id, createdAt: now, updatedAt: now })
        .onConflictDoNothing()
      events.push({ id: e.id, status: res.meta.changes > 0 ? "created" : "exists" })
    }
  }

  return c.json({ seeded: results, orgs, members, teams, events })
})

export default seed
