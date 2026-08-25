import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import { drizzle } from "drizzle-orm/d1"
import { eq } from "drizzle-orm"
import type { AppEnv } from "../types"
import * as schema from "../db/schema"
import { requirePermission } from "../middleware/require-permission"
import { requireOrgMember } from "../middleware/require-org-member"
import { AGE_GROUP_CODES, GENDER_CODES } from "../domain/vocabularies"
import { deleteNames, pivot, readNames, writeNames, type Names } from "../domain/localized"

/**
 * Reads are public; writes need two things to line up.
 *
 * `requirePermission("team", ...)` asks the platform-wide question — is this
 * actor type allowed to touch teams at all — and the biz access matrix puts
 * that on the Coach. `requireOrgMember` then asks the object-scoped one: is
 * this coach a member of the school whose team this is. Either alone is wrong.
 * Permission alone lets any coach edit any school's roster; membership alone
 * lets a spectator who happens to belong to the org edit it.
 *
 * ADR 008 shipped this file read-only because the second question had nowhere
 * to look. ADR 009 adopted the organization plugin's membership tables, which
 * is what makes the write path expressible.
 */

// Controlled vocabularies from remy-sport-biz/data/seed/. Canonical keeps these
// in reference tables; validating them here is the same trade `event.type`
// makes — a TEXT column cannot express a vocabulary to the type system, and the
// API should reject bad input at the boundary rather than surfacing a foreign
// key error.
//
// The codes are no longer written out here. They come from the generated
// vocabularies, so this enum and the rows migration 0009 seeds are the same
// list by construction rather than by a test noticing they disagree.
const AgeGroupSchema = z.enum(AGE_GROUP_CODES)
const GenderSchema = z.enum(GENDER_CODES)

/**
 * Display names keyed by locale — the same shape /api/reference returns.
 *
 * There is no `nameTh` here and there never should be again: a per-language
 * field means every new language edits this schema, the table, and every
 * consumer. See src/domain/localized.ts.
 */
const NamesSchema = z.record(z.string(), z.string()).openapi({
  description: "Display names keyed by locale code",
  example: { en: "Assumption College U16 Boys", th: "ทีมบาสเกตบอลอัสสัมชัญ U16 ชาย" },
})

const TeamSchema = z.object({
  id: z.string(),
  /** The English pivot stored on the row: a guaranteed non-empty fallback. */
  name: z.string(),
  names: NamesSchema,
  ageGroupCode: AgeGroupSchema,
  genderCode: GenderSchema,
  orgId: z.string(),
  // Joined from `organization` — the team page shows the school, not an id.
  orgName: z.string().nullable(),
  orgNames: NamesSchema,
  orgCityCode: z.string().nullable(),
  orgProvinceCode: z.string().nullable(),
})

const ErrorSchema = z.object({ error: z.string() })

type OrgColumns = {
  orgName: string | null
  orgCityCode: string | null
  orgProvinceCode: string | null
}

function serializeTeam(
  row: typeof schema.team.$inferSelect,
  org: OrgColumns,
  names: Names,
  orgNames: Names,
) {
  return {
    id: row.id,
    name: row.name,
    // The pivot is always a valid name, so a record with no catalogue rows
    // still serialises to something renderable rather than to `{}`.
    names: Object.keys(names).length ? names : { en: row.name },
    ageGroupCode: row.ageGroupCode as z.infer<typeof AgeGroupSchema>,
    genderCode: row.genderCode as z.infer<typeof GenderSchema>,
    orgId: row.orgId,
    ...org,
    orgNames: Object.keys(orgNames).length ? orgNames : org.orgName ? { en: org.orgName } : {},
  }
}

const orgColumns = {
  orgName: schema.organization.name,
  orgCityCode: schema.organization.cityCode,
  orgProvinceCode: schema.organization.provinceCode,
}

const teams = new OpenAPIHono<AppEnv>()

// ── GET /api/teams — public ────────────────────────────────────────────────

const listTeamsRoute = createRoute({
  method: "get",
  path: "/api/teams",
  responses: {
    200: {
      description: "List all teams",
      content: { "application/json": { schema: z.object({ teams: z.array(TeamSchema) }) } },
    },
  },
})

teams.openapi(listTeamsRoute, async (c) => {
  const db = drizzle(c.env.DB, { schema })
  // leftJoin so a team still lists if its organization row is missing, matching
  // how /api/events treats a missing organizer.
  const rows = await db
    .select({ team: schema.team, ...orgColumns })
    .from(schema.team)
    .leftJoin(schema.organization, eq(schema.team.orgId, schema.organization.id))
    .orderBy(schema.team.name)
    .all()

  // Two batched lookups for the whole page rather than one per row: resolving
  // names inside the map would be an N+1 the moment the list grows.
  const teamNames = await readNames(db, "team", rows.map((r) => r.team.id))
  const orgNames = await readNames(
    db,
    "organization",
    rows.flatMap((r) => (r.team.orgId ? [r.team.orgId] : [])),
  )

  return c.json({
    teams: rows.map(({ team, ...org }) =>
      serializeTeam(team, org, teamNames.get(team.id) ?? {}, orgNames.get(team.orgId) ?? {}),
    ),
  })
})

// ── GET /api/teams/:id — public ────────────────────────────────────────────

const getTeamRoute = createRoute({
  method: "get",
  path: "/api/teams/{id}",
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: "Team details", content: { "application/json": { schema: TeamSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: ErrorSchema } } },
  },
})

teams.openapi(getTeamRoute, async (c) => {
  const { id } = c.req.valid("param")
  const db = drizzle(c.env.DB, { schema })
  const row = await db
    .select({ team: schema.team, ...orgColumns })
    .from(schema.team)
    .leftJoin(schema.organization, eq(schema.team.orgId, schema.organization.id))
    .where(eq(schema.team.id, id))
    .get()
  if (!row) return c.json({ error: "Not found" }, 404)
  const { team, ...org } = row
  const [names, orgNames] = await Promise.all([
    readNames(db, "team", [team.id]),
    readNames(db, "organization", [team.orgId]),
  ])
  return c.json(
    serializeTeam(team, org, names.get(team.id) ?? {}, orgNames.get(team.orgId) ?? {}),
    200,
  )
})

// ── Writes ─────────────────────────────────────────────────────────────────

const CreateTeamSchema = z.object({
  // A map, not `name` + `nameTh`. Requiring at least one entry rather than
  // requiring English keeps a Thai-only submission valid — the pivot falls back
  // to whatever language was supplied. See `pivot()`.
  names: NamesSchema.refine((n) => Object.values(n).some((v) => v?.trim()), {
    message: "at least one locale must carry a name",
  }),
  orgId: z.string().min(1),
  ageGroupCode: AgeGroupSchema,
  genderCode: GenderSchema,
})

// Everything optional, but orgId is excluded entirely: moving a team between
// schools is a transfer, not an edit, and would need membership of *both*
// orgs to be checked. Out of scope until a transfer flow exists.
const UpdateTeamSchema = CreateTeamSchema.omit({ orgId: true }).partial()

/** Read an org id straight off the request body, for create. */
async function orgIdFromBody(c: { req: { json: () => Promise<unknown> } }) {
  try {
    const body = (await c.req.json()) as { orgId?: unknown }
    return typeof body.orgId === "string" && body.orgId.length > 0 ? body.orgId : null
  } catch {
    return null
  }
}

/**
 * Read an org id by looking up the team being modified, for update/delete.
 * `teamId` is typed optional because `c.req.param` is; a missing id resolves
 * to null, which requireOrgMember turns into a 404.
 */
async function orgIdFromTeam(env: AppEnv["Bindings"], teamId: string | undefined) {
  if (!teamId) return null
  const db = drizzle(env.DB, { schema })
  const row = await db
    .select({ orgId: schema.team.orgId })
    .from(schema.team)
    .where(eq(schema.team.id, teamId))
    .get()
  return row?.orgId ?? null
}

const createTeamRoute = createRoute({
  method: "post",
  path: "/api/teams",
  security: [{ Session: [] }],
  middleware: [
    requirePermission("team", "create"),
    requireOrgMember((c) => orgIdFromBody(c)),
  ] as const,
  request: {
    body: { content: { "application/json": { schema: CreateTeamSchema } } },
  },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: TeamSchema } } },
    400: { description: "Bad request", content: { "application/json": { schema: ErrorSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ErrorSchema } } },
    404: { description: "Unknown organization", content: { "application/json": { schema: ErrorSchema } } },
  },
})

teams.openapi(createTeamRoute, async (c) => {
  const body = c.req.valid("json")
  const db = drizzle(c.env.DB, { schema })

  // requireOrgMember proved the caller belongs to this org, which for a real
  // org id also proves it exists — but a member row can outlive its
  // organization, so the FK target is confirmed rather than assumed.
  const org = await db
    .select(orgColumns)
    .from(schema.organization)
    .where(eq(schema.organization.id, body.orgId))
    .get()
  if (!org) return c.json({ error: "Unknown organization" }, 404)

  const now = new Date()
  const id = `team_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`
  const row = {
    id,
    name: pivot(body.names)!, // the refine above guarantees one
    orgId: body.orgId,
    ageGroupCode: body.ageGroupCode,
    genderCode: body.genderCode,
    createdAt: now,
    updatedAt: now,
  }
  await db.insert(schema.team).values(row)
  await writeNames(db, "team", id, body.names)

  const orgNames = await readNames(db, "organization", [body.orgId])
  return c.json(serializeTeam(row, org, body.names, orgNames.get(body.orgId) ?? {}), 201)
})

const updateTeamRoute = createRoute({
  method: "put",
  path: "/api/teams/{id}",
  security: [{ Session: [] }],
  middleware: [
    requirePermission("team", "update"),
    requireOrgMember((c) => orgIdFromTeam(c.env, c.req.param("id"))),
  ] as const,
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { "application/json": { schema: UpdateTeamSchema } } },
  },
  responses: {
    200: { description: "Updated", content: { "application/json": { schema: TeamSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ErrorSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: ErrorSchema } } },
  },
})

teams.openapi(updateTeamRoute, async (c) => {
  const { id } = c.req.valid("param")
  const body = c.req.valid("json")
  const db = drizzle(c.env.DB, { schema })

  const { names, ...columns } = body
  // The pivot moves with the names, so `name` never goes stale against the
  // catalogue — it is derived, not separately editable.
  await db
    .update(schema.team)
    .set({
      ...columns,
      ...(names ? { name: pivot(names) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.team.id, id))
  if (names) await writeNames(db, "team", id, names)

  const row = await db
    .select({ team: schema.team, ...orgColumns })
    .from(schema.team)
    .leftJoin(schema.organization, eq(schema.team.orgId, schema.organization.id))
    .where(eq(schema.team.id, id))
    .get()
  if (!row) return c.json({ error: "Not found" }, 404)
  const { team, ...org } = row
  const [teamNames, orgNames] = await Promise.all([
    readNames(db, "team", [team.id]),
    readNames(db, "organization", [team.orgId]),
  ])
  return c.json(
    serializeTeam(team, org, teamNames.get(team.id) ?? {}, orgNames.get(team.orgId) ?? {}),
    200,
  )
})

const deleteTeamRoute = createRoute({
  method: "delete",
  path: "/api/teams/{id}",
  security: [{ Session: [] }],
  // No requireOrgMember here, deliberately. biz data/access/matrix.md grants
  // DELETE_TEAM to PLATFORM_ADMIN and to nobody else, and access-control.ts
  // matches — only the platform `admin` role holds `team:delete`. Platform
  // admins are not members of every school and bypass org checks by design, so
  // an org-membership tier on this route could never fire. Adding one would be
  // dead code that also implies org admins may delete teams, which the PO did
  // not grant. Create and update are the org-scoped pair.
  middleware: [requirePermission("team", "delete")] as const,
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: "Deleted", content: { "application/json": { schema: z.object({ deleted: z.string() }) } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: ErrorSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: ErrorSchema } } },
  },
})

teams.openapi(deleteTeamRoute, async (c) => {
  const { id } = c.req.valid("param")
  const db = drizzle(c.env.DB, { schema })
  const res = await db.delete(schema.team).where(eq(schema.team.id, id))
  // 404 rather than a cheerful 200 for an id that was never there — the other
  // write routes get this from requireOrgMember, which this one does not run.
  if (res.meta.changes === 0) return c.json({ error: "Not found" }, 404)
  // Names are not FK'd to the row they describe (the catalogue is polymorphic),
  // so deleting the team would otherwise leave them behind for a future id.
  await deleteNames(db, "team", id)
  return c.json({ deleted: id }, 200)
})

export default teams
