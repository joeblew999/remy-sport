import { Hono } from "hono"
import { drizzle } from "drizzle-orm/d1"
import { and, eq } from "drizzle-orm"
import { createAuth } from "../auth"
import * as schema from "../db/schema"
import { clean, pivot } from "../domain/names"
import { SEED_ENTITIES, SEED_RELATIONSHIPS } from "../db/seed-data"
import type { Names } from "../domain/names"

/**
 * Orgs, teams and events come from the PO's fixtures, generated.
 *
 * They used to be typed out here with `// biz org_001` comments pointing at the
 * rows they copied — which is how the seeded organisations came to disagree
 * with biz on three names, with nothing to notice (ADR 015).
 *
 * SEED_USERS below is deliberately NOT swapped for the fixtures' users. Those
 * six are dev sign-in accounts — test infrastructure, one per role, whose
 * addresses every spec authenticates with. The fixtures' twelve are fictional
 * Thai people, which is domain data. Different things that happen to share a
 * table.
 */
const SEED_ORGS = SEED_ENTITIES.orgs
const SEED_TEAMS = SEED_ENTITIES.teams
const SEED_EVENTS = SEED_ENTITIES.events

/** biz org id -> slug, so a team's `org_id` can find the organisation. */
const ORG_SLUG = new Map(SEED_ORGS.map((o) => [o.id, o.slug]))

/**
 * The fixtures are plural; the tables are singular. Same rule the generator
 * applies, kept in step by both reading the same fixture names.
 */
const singularOf = (plural: string) =>
  plural.endsWith("ies")
    ? `${plural.slice(0, -3)}y`
    : /(?:ch|sh|ss|us|x|z)es$/.test(plural)
      ? plural.slice(0, -2)
      : plural.endsWith("s")
        ? plural.slice(0, -1)
        : plural
import type { AppEnv } from "../types"

// Passwords are gone (ADR 012). These used to be committed here — real,
// working credentials for an admin account, seeded into production by
// `seed:remote`. Sign-in is now by emailed code.
/**
 * The demo accounts are the Product Owner's people.
 *
 * Six were invented here — admin@remy.dev, coach@remy.dev, one per role, with
 * English names. The fixtures already describe twelve realistic Thai users,
 * named in both languages, with the roles, statuses and contact channels the
 * domain actually has: three organisers across different bodies, three coaches
 * at different schools, and a referee in PENDING_APPROVAL that the invented set
 * had no way to express.
 *
 * `role` is lowercased on the way in: the fixtures say ADMIN, and
 * access-control.ts — which Better Auth types `createUser` against — says
 * admin. Same delta the event types carry, applied at the same seam.
 */
const SEED_USERS = SEED_ENTITIES.users.map((u) => ({
  bizId: u.id,
  email: u.email,
  name: u.names.en,
  role: u.roleCode.toLowerCase() as Lowercase<typeof u.roleCode>,
}))

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

/**
 * Organisations and teams, copied from the Product Owner's fixtures in
 * remy-sport-biz/data/seed/orgs.jsonl and teams.jsonl (ADR 008).
 *
 * Only the three orgs the seeded teams belong to are created — the federation
 * and club rows in the biz file have no teams, so seeding them would put rows
 * on screen that nothing links to.
 */

/**
 * Teams reference their org by **slug**, not by the biz fixture's `org_id`.
 *
 * Better Auth generates the organization's primary key itself, and its
 * `member` rows point at that generated id. Rewriting the id to match the biz
 * fixture would orphan the membership created alongside it. The slug is unique,
 * stable, and the one field both sides agree on, so it is the join key here.
 */

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
        // additionalFields go under `data`, not beside the base fields.
        body: { email: u.email, name: u.name, role: u.role, data: { bizId: u.bizId } },
      })
      results.push({ email: u.email, role: u.role, status: "created" })
    } catch {
      results.push({ email: u.email, role: u.role, status: "exists" })
    }
  }

  // `created_by` is a real FK to user.id, so this runs after the users exist.
  //
  // Better Auth generates those ids, so the fixtures' `usr_org_001` is resolved
  // through `biz_id` — the bridge added in migration 0011. One lookup builds
  // the map; every fixture row that names a user goes through it.
  const db = drizzle(c.env.DB, { schema })
  const seeded = await db
    .select({ id: schema.user.id, bizId: schema.user.bizId })
    .from(schema.user)
    .all()
  const USER_ID = new Map(
    seeded.flatMap((u) => (u.bizId ? [[u.bizId, u.id] as const] : [])),
  )

  // Organisations, then teams — team.org_id is a real FK.
  //
  // Created through Better Auth's own API rather than an INSERT, for the reason
  // ADR 007 §3 gives about roles: a raw write to a Better Auth table sidesteps
  // its hooks and its idea of what a valid organization is. The owner is the
  // seeded admin, so the org has a member from the start.
  const orgs: { slug: string; status: string }[] = []
  const adminId = USER_ID.get("usr_admin_001")
  const admin = adminId ? { id: adminId } : null

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
            name: pivot(o.names)!,
            // Better Auth's additionalFields have no JSON type, so the map is
            // stored as a string here and parsed in src/api/teams.ts.
            names: JSON.stringify(clean(o.names)),
            slug: o.slug,
            userId: admin.id,
            orgTypeCode: o.orgTypeCode,
            cityCode: o.cityCode,
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
    { bizId: "usr_coach_001", slug: "assumption-college", role: "admin" },
    { bizId: "usr_org_002", slug: "triam-udom-suksa", role: "member" },
  ] as const

  const members: { bizId: string; slug: string; status: string }[] = []
  for (const m of MEMBERSHIPS) {
    const u = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.bizId, m.bizId))
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
      // The fixtures key a team to its org by biz id; Better Auth generates its
      // own, so the slug is the bridge between them.
      .where(eq(schema.organization.slug, ORG_SLUG.get(t.orgId) ?? ""))
      .get()
    if (!org) {
      teams.push({ id: t.id, status: "skipped: org missing" })
      continue
    }
    const { orgId: _orgId, names, ...cols } = t
    const res = await db
      .insert(schema.team)
      .values({
        ...cols,
        names: clean(names),
        name: pivot(names)!,
        orgId: org.id,
        createdAt: teamNow,
        updatedAt: teamNow,
      })
      .onConflictDoNothing()
    teams.push({ id: t.id, status: res.meta.changes > 0 ? "created" : "exists" })
  }

  const events: { id: string; status: string }[] = []
  {
    const now = new Date()
    for (const e of SEED_EVENTS) {
      // onConflictDoNothing keeps /api/seed idempotent, matching the user loop
      // above — re-seeding must not duplicate or clobber edited rows.
      // `org_id` is the fixtures' own id and has no column here — events carry
      // their organiser, and the organisation comes through that user.
      const { names, orgId: _orgId, organizerUserId, ...cols } = e
      // Each event is created by the organiser the fixtures name, not by one
      // global account — three different bodies run these four events, and the
      // ownership tests are only meaningful if that is true in the data.
      const createdBy = USER_ID.get(organizerUserId)
      if (!createdBy) {
        events.push({ id: e.id, status: `skipped: no user for ${organizerUserId}` })
        continue
      }
      const res = await db
        .insert(schema.event)
        .values({
          ...cols,
          names: clean(names),
          name: pivot(names)!,
          description: null,
          createdBy,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
      events.push({ id: e.id, status: res.meta.changes > 0 ? "created" : "exists" })
    }
  }

  // ── The rest of the model ────────────────────────────────────────────────
  //
  // Players, divisions, venues and every join table between them, straight from
  // the fixtures. Two columns are translated on the way in: `user_id` and
  // `org_id`, because Better Auth generates those ids while every other id in
  // the fixtures is used verbatim. Everything else is inserted as written, and
  // the foreign keys migration 0013 declares hold it to the PO's model.
  const ORG_ID = new Map(
    (await db.select({ id: schema.organization.id, slug: schema.organization.slug }).from(schema.organization).all())
      .flatMap((o) => {
        const bizId = [...ORG_SLUG.entries()].find(([, slug]) => slug === o.slug)?.[0]
        return bizId ? [[bizId, o.id] as const] : []
      }),
  )

  const translate = (row: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(row).map(([k, v]) => {
        if (typeof v !== "string") return [k, v]
        if (k === "userId" || k.endsWith("UserId")) return [k, USER_ID.get(v) ?? v]
        if (k === "orgId") return [k, ORG_ID.get(v as never) ?? v]
        return [k, v]
      }),
    )

  const model: Record<string, number> = {}
  for (const [name, rows] of [
    ...Object.entries(SEED_ENTITIES).filter(([n]) => !["users", "orgs", "teams", "events"].includes(n)),
    ...Object.entries(SEED_RELATIONSHIPS),
  ] as [string, readonly Record<string, unknown>[]][]) {
    const table = (schema as Record<string, unknown>)[singularOf(name)] as never
    if (!table) continue
    let written = 0
    for (const row of rows as readonly Record<string, unknown>[]) {
      const values = translate(row)
      if ("names" in values) values.names = clean(values.names as Names)
      const res = await db.insert(table).values(values).onConflictDoNothing()
      written += res.meta.changes
    }
    model[name] = written
  }

  return c.json({ seeded: results, orgs, members, teams, events, model })
})

export default seed
