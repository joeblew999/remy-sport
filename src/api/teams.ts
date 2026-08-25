/**
 * Teams.
 *
 * Reads are public; writes need both access-control questions to line up —
 * `requirePermission` for the actor type, `requireOrgMember` for the object.
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
import { authed, orgOfTeam, pub, requireOrgMember, requirePermission, type Db } from "./base"

const withOrg = {
  organization: { columns: { name: true, names: true, cityCode: true, provinceCode: true } },
} as const

/**
 * `organization` is Better Auth's table, and its additionalFields have no JSON
 * type — so its `names` arrives as a string and is parsed here, the one place
 * that reads it. Our own tables use a typed JSON column and need none of this.
 */
function orgNames(raw: string | null | undefined): Names {
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Names
  } catch {
    return {}
  }
}

function serialize(
  row: typeof schema.team.$inferSelect & {
    organization?: {
      name: string
      names: string | null
      cityCode: string | null
      provinceCode: string | null
    } | null
  },
): ApiTeam {
  const { organization, createdAt, updatedAt, ageGroupCode, genderCode, ...rest } = row
  return {
    ...rest,
    // The database cannot express a vocabulary to the type system, so the enum
    // lives at the boundary; the FKs added in 0009 hold the line underneath.
    ageGroupCode: ageGroupCode as ApiTeam["ageGroupCode"],
    genderCode: genderCode as ApiTeam["genderCode"],
    orgName: organization?.name ?? null,
    orgNames: orgNames(organization?.names),
    orgCityCode: organization?.cityCode ?? null,
    orgProvinceCode: organization?.provinceCode ?? null,
  }
}

export const list = pub.teams.list.handler(async ({ context }) => ({
    teams: (
      await context.db.query.team.findMany({ with: withOrg, orderBy: (t, { asc }) => [asc(t.name)] })
    ).map(serialize),
  }))

const byId = (db: Db, id: string) =>
  db.query.team.findFirst({ where: (t, { eq: is }) => is(t.id, id), with: withOrg })

export const get = pub.teams.get.handler(async ({ context, input }) => {
    const row = await byId(context.db, input.id)
    if (!row) throw new ORPCError("NOT_FOUND", { message: "Not found" })
    return serialize(row)
  })

export const create = authed.teams.create
  .use(requirePermission("team", "create"))
  .use(requireOrgMember((input: { orgId: string }) => input.orgId))
  .handler(async ({ context, input }) => {
    // requireOrgMember proved the caller belongs to this org, which for a real
    // org id also proves it exists — but a member row can outlive its
    // organization, so the FK target is confirmed rather than assumed.
    const org = await context.db
      .select()
      .from(schema.organization)
      .where(eq(schema.organization.id, input.orgId))
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
    return serialize({ ...row, organization: org })
  })

export const update = authed.teams.update
  .use(requirePermission("team", "update"))
  .use(requireOrgMember(orgOfTeam))
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

export const remove = authed.teams.delete
  // No requireOrgMember here, deliberately. biz data/access/matrix.md grants
  // DELETE_TEAM to PLATFORM_ADMIN and to nobody else, and access-control.ts
  // matches — only the platform `admin` role holds `team:delete`. Platform
  // admins are not members of every school and bypass org checks by design, so
  // an org-membership tier could never fire. Adding one would be dead code that
  // also implies org admins may delete teams, which the PO did not grant.
  .use(requirePermission("team", "delete"))
  .handler(async ({ context, input }) => {
    const res = await context.db.delete(schema.team).where(eq(schema.team.id, input.id))
    // 404 rather than a cheerful 200 for an id that was never there — the other
    // write routes get this from requireOrgMember, which this one does not run.
    if (res.meta.changes === 0) throw new ORPCError("NOT_FOUND", { message: "Not found" })
    return { deleted: input.id }
  })
