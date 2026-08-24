import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import { drizzle } from "drizzle-orm/d1"
import { eq } from "drizzle-orm"
import type { AppEnv } from "../types"
import * as schema from "../db/schema"
import { requirePermission } from "../middleware/require-permission"
import { requireOrgMember } from "../middleware/require-org-member"

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
// in reference tables; validating them here is the same trade `event.type` makes.
const AgeGroupSchema = z.enum(["U10", "U12", "U14", "U16", "U18", "U21", "OPEN", "SENIOR"])
const GenderSchema = z.enum(["M", "F", "COED"])

const TeamSchema = z.object({
  id: z.string(),
  name: z.string(),
  nameTh: z.string().nullable(),
  ageGroupCode: AgeGroupSchema,
  genderCode: GenderSchema,
  orgId: z.string(),
  // Joined from `organization` — the team page shows the school, not an id.
  orgName: z.string().nullable(),
  orgNameTh: z.string().nullable(),
  orgCity: z.string().nullable(),
  orgProvinceCode: z.string().nullable(),
})

const ErrorSchema = z.object({ error: z.string() })

type OrgColumns = {
  orgName: string | null
  orgNameTh: string | null
  orgCity: string | null
  orgProvinceCode: string | null
}

function serializeTeam(row: typeof schema.team.$inferSelect, org: OrgColumns) {
  return {
    id: row.id,
    name: row.name,
    nameTh: row.nameTh,
    ageGroupCode: row.ageGroupCode as z.infer<typeof AgeGroupSchema>,
    genderCode: row.genderCode as z.infer<typeof GenderSchema>,
    orgId: row.orgId,
    ...org,
  }
}

const orgColumns = {
  orgName: schema.organization.name,
  orgNameTh: schema.organization.nameTh,
  orgCity: schema.organization.city,
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
  return c.json({ teams: rows.map(({ team, ...org }) => serializeTeam(team, org)) })
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
  return c.json(serializeTeam(team, org), 200)
})

// ── Writes ─────────────────────────────────────────────────────────────────

const CreateTeamSchema = z.object({
  name: z.string().min(1),
  nameTh: z.string().nullable().optional(),
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
    name: body.name,
    nameTh: body.nameTh ?? null,
    orgId: body.orgId,
    ageGroupCode: body.ageGroupCode,
    genderCode: body.genderCode,
    createdAt: now,
    updatedAt: now,
  }
  await db.insert(schema.team).values(row)
  return c.json(serializeTeam(row, org), 201)
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

  await db
    .update(schema.team)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(schema.team.id, id))

  const row = await db
    .select({ team: schema.team, ...orgColumns })
    .from(schema.team)
    .leftJoin(schema.organization, eq(schema.team.orgId, schema.organization.id))
    .where(eq(schema.team.id, id))
    .get()
  if (!row) return c.json({ error: "Not found" }, 404)
  const { team, ...org } = row
  return c.json(serializeTeam(team, org), 200)
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
  return c.json({ deleted: id }, 200)
})

export default teams
