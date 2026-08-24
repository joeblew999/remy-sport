import { createMiddleware } from "hono/factory"
import { drizzle } from "drizzle-orm/d1"
import { and, eq } from "drizzle-orm"
import type { AppEnv } from "../types"
import * as schema from "../db/schema"

/**
 * Object-scoped authorization: is this user a member of *this* organization?
 *
 * `requirePermission` answers "may this role do this kind of thing at all",
 * which is a platform-wide question — every coach can edit teams. It cannot
 * answer "may this coach edit *this* team", because that depends on the user's
 * relation to one specific object. Before the organization plugin was adopted
 * there was nowhere to look that up, which is why ADR 008 shipped
 * `/api/teams` read-only.
 *
 * Membership is the relation. `member` rows are written by Better Auth's own
 * `createOrganization`/`addMember` paths, so this reads the same source of
 * truth the auth layer maintains rather than a parallel copy (ADR 007 §1).
 *
 * Scope note: this is deliberately membership-scoped, not a general relation
 * engine. biz decision-002 puts object-scoped policy in a Zanzibar-style
 * engine over PO-owned JSONL, and this does not attempt to be that — see
 * ADR 009 for where the line sits.
 */

/** Better Auth's own organization-level roles, most privileged first. */
const ORG_ROLE_RANK = ["owner", "admin", "member"] as const
export type OrgRole = (typeof ORG_ROLE_RANK)[number]

function rankOf(role: string): number {
  const i = ORG_ROLE_RANK.indexOf(role as OrgRole)
  // An unknown role ranks below every known one rather than above: a role the
  // code does not recognise must never satisfy a minimum-role check.
  return i === -1 ? ORG_ROLE_RANK.length : i
}

/**
 * Look up a user's org role. Returns null when they are not a member.
 * Exported so route handlers can branch on membership without a 403.
 */
export async function orgRoleFor(
  env: AppEnv["Bindings"],
  userId: string,
  organizationId: string,
): Promise<string | null> {
  const db = drizzle(env.DB, { schema })
  const row = await db
    .select({ role: schema.member.role })
    .from(schema.member)
    .where(
      and(
        eq(schema.member.userId, userId),
        eq(schema.member.organizationId, organizationId),
      ),
    )
    .get()
  return row?.role ?? null
}

/**
 * Require membership of the organization named by `orgIdFrom(c)`.
 *
 * `minRole` is a *minimum*: "admin" is satisfied by owner or admin, not by a
 * plain member. Platform admins bypass the check — they are the break-glass
 * role and are not members of every school.
 */
export function requireOrgMember(
  orgIdFrom: (c: Parameters<Parameters<typeof createMiddleware<AppEnv>>[0]>[0]) => Promise<string | null> | string | null,
  minRole: OrgRole = "member",
) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get("user")
    if (!user) return c.json({ error: "Unauthorized" }, 401)

    const orgId = await orgIdFrom(c)
    // A null org id means the target object does not exist. 404 rather than
    // 403: saying "forbidden" for a missing id tells an anonymous caller which
    // ids are real.
    if (!orgId) return c.json({ error: "Not found" }, 404)

    if ((user as { role?: string }).role === "admin") return next()

    const role = await orgRoleFor(c.env, user.id, orgId)
    if (!role) return c.json({ error: "Not a member of this organization" }, 403)
    if (rankOf(role) > rankOf(minRole)) {
      return c.json({ error: `Requires ${minRole} in this organization` }, 403)
    }

    c.set("orgRole", role)
    await next()
  })
}
