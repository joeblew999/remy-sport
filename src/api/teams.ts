/**
 * Teams.
 *
 * Reads are public; writes need both access-control questions to line up —
 * `requireAction`: the PO's grants name the relations that satisfy the action,
 * and each relation resolves itself from the tables it is derived from.
 * ADR 009 and src/api/base.ts explain why either alone is wrong.
 *
 * The organisation join is a `with:` on the relation declared in app-schema,
 * not a leftJoin plus a hand-picked column list.
 */

import { ORPCError } from "@orpc/server"
import { eq } from "drizzle-orm"
import * as schema from "../db/schema"
import type { ApiTeam } from "../domain/api"
import type { Names } from "../domain/names"
import { clean, pivot } from "../domain/names"
import { z } from "zod"
import { CreateTeamInput, TeamSchema, UpdateTeamInput } from "../domain/api"
import { authed, authedRoute, pub, requireAction, type Db } from "./base"

const IdInput = z.object({ id: z.string() })

const withOrg = {
  org: { columns: { names: true, cityCode: true, provinceCode: true } },
} as const

function serialize(
  row: typeof schema.team.$inferSelect & {
    org?: { names: Names; cityCode: string | null; provinceCode: string | null } | null
  },
): ApiTeam {
  const { org, createdAt, updatedAt, ageGroupCode, genderCode, ...rest } = row
  return {
    ...rest,
    ageGroupCode,
    genderCode,
    // `names` is a real JSON column now, so there is nothing to parse and the
    // English pivot comes from the same helper every other name uses.
    orgName: org ? (pivot(org.names) ?? null) : null,
    orgNames: org?.names ?? {},
    orgCityCode: org?.cityCode ?? null,
    orgProvinceCode: org?.provinceCode ?? null,
  }
}

export const list = pub
  .route({ method: "GET", path: "/teams", summary: "List all teams" })
  .output(z.object({ teams: z.array(TeamSchema) }))
  .handler(async ({ context }) => ({
    teams: (
      await context.db.query.team.findMany({ with: withOrg, orderBy: (t, { asc }) => [asc(t.name)] })
    ).map(serialize),
  }))

const byId = (db: Db, id: string) =>
  db.query.team.findFirst({ where: (t, { eq: is }) => is(t.id, id), with: withOrg })

export const get = pub
  .route({ method: "GET", path: "/teams/{id}", summary: "Get one team" })
  .input(IdInput)
  .output(TeamSchema)
  .handler(async ({ context, input }) => {
    const row = await byId(context.db, input.id)
    if (!row) throw new ORPCError("NOT_FOUND", { message: "Not found" })
    return serialize(row)
  })

export const create = authed
  .route({ method: "POST", path: "/teams", summary: "Create a team", successStatus: 201, ...authedRoute })
  .input(CreateTeamInput)
  .output(TeamSchema)
  .use(requireAction("CREATE_TEAM"))
  .handler(async ({ context, input }) => {
    // CREATE_TEAM is a PLATFORM action — the PO grants it to ANY_COACH and
    // PLATFORM_ADMIN, with no relation to the org — so nothing upstream has
    // confirmed this org exists. The FK would fail anyway; a 404 says why.
    const org = await context.db
      .select()
      .from(schema.org)
      .where(eq(schema.org.id, input.orgId))
      .get()
    if (!org) throw new ORPCError("NOT_FOUND", { message: "Unknown organization" })

    const now = new Date()
    const names = clean(input.names)
    const row = {
      id: `team_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
      names,
      name: pivot(names)!, // the input schema guarantees one
      orgId: input.orgId,
      ageGroupCode: input.ageGroupCode,
      genderCode: input.genderCode,
      createdAt: now,
      updatedAt: now,
    }
    await context.db.insert(schema.team).values(row)

    // The creator becomes its head coach, and this is not a nicety.
    //
    // CREATE_TEAM is granted to ANY_COACH with no relation to the object — a
    // team does not exist yet, so there is nothing to relate to. But every
    // action on a team afterwards is scoped by `team_coaches`
    // (EDIT_TEAM_PROFILE, MANAGE_ROSTER), so without this the coach who just
    // created a team could not edit it. Creating one is the act that makes you
    // its coach.
    //
    // Not for platform admins: they hold PLATFORM_ADMIN on everything already,
    // and writing them into a school's coaching staff would be a lie in the data.
    if (context.user.role !== "admin") {
      await context.db
        .insert(schema.teamCoach)
        .values({ teamId: row.id, userId: context.user.id, coachRoleCode: "HEAD" })
        .onConflictDoNothing()
    }

    return serialize({ ...row, org })
  })

export const update = authed
  .route({ method: "PUT", path: "/teams/{id}", summary: "Update a team", ...authedRoute })
  .input(IdInput.extend(UpdateTeamInput.shape))
  .output(TeamSchema)
  .use(requireAction("EDIT_TEAM_PROFILE"))
  .handler(async ({ context, input }) => {
    const { id, names, ...columns } = input
    await context.db
      .update(schema.team)
      // The pivot moves with the names, so `name` never goes stale against
      // them — it is derived, not separately editable.
      .set({
        ...columns,
        ...(names ? { names: clean(names), name: pivot(names) } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.team.id, id))

    const row = await byId(context.db, id)
    if (!row) throw new ORPCError("NOT_FOUND", { message: "Not found" })
    return serialize(row)
  })

export const remove = authed
  .route({ method: "DELETE", path: "/teams/{id}", summary: "Delete a team", ...authedRoute })
  .input(IdInput)
  .output(z.object({ deleted: z.string() }))
  // The PO grants DELETE_TEAM to PLATFORM_ADMIN and to nobody else — no relation
  // to the team is required or accepted, so this is the one team write where
  // holding a coaching role changes nothing.
  .use(requireAction("DELETE_TEAM"))
  .handler(async ({ context, input }) => {
    // The rows that point at this team, first.
    //
    // Three tables carry a non-null FK to team.id, and none was declared
    // ON DELETE CASCADE in migration 0013, so the delete fails at the database
    // rather than orphaning anything. That was invisible while nothing wrote
    // these rows during a test; `create` now records the creator as head coach,
    // so every created team has a dependent row from birth.
    await context.db.batch([
      context.db.delete(schema.teamCoach).where(eq(schema.teamCoach.teamId, input.id)),
      context.db.delete(schema.playerTeam).where(eq(schema.playerTeam.teamId, input.id)),
      context.db.delete(schema.eventTeam).where(eq(schema.eventTeam.teamId, input.id)),
    ])

    const res = await context.db.delete(schema.team).where(eq(schema.team.id, input.id))
    // requireAction has already 404'd a missing id — it resolves the table from
    // the action's object type — so reaching zero changes here means the row was
    // deleted between the two. Still a 404 to the caller.
    if (res.meta.changes === 0) throw new ORPCError("NOT_FOUND", { message: "Not found" })
    return { deleted: input.id }
  })
