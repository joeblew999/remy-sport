/**
 * The oRPC base: one context, and the two access-control questions as
 * middleware.
 *
 * Every procedure is built from `pub` (open) or `authed` (signed in). Access
 * control stays EXPLICIT per procedure — `.use(requirePermission(...))` reads
 * on the procedure that needs it, exactly as the Hono middleware did. The
 * factory removed the route scaffolding, not the security.
 *
 * ADR 009: authorising a write needs both questions. `requirePermission` asks
 * whether this actor type may do this at all; `requireOrgMember` asks whether
 * they stand in the right relation to *this* object. Either alone is wrong —
 * permission alone lets any coach edit any school's roster, membership alone
 * lets a spectator who belongs to the org edit it.
 */

import { ORPCError, implement, os } from "@orpc/server"
import { contract } from "../domain/contract"
import { drizzle } from "drizzle-orm/d1"
import { eq } from "drizzle-orm"
import * as schema from "../db/schema"
import { roles } from "../auth/access-control"
import { orgRoleFor, rankOf, type OrgRole } from "../middleware/require-org-member"
import type { Bindings } from "../types"

export interface ApiContext {
  env: Bindings
  user: { id: string; name?: string | null; role?: string | null } | null
}

export type Db = ReturnType<typeof database>
export const database = (env: Bindings) => drizzle(env.DB, { schema })

/**
 * Procedures are built by IMPLEMENTING the contract, not by redeclaring it.
 * `implement` binds each handler to the contract's route, input and output, so
 * a path or a schema cannot be stated twice and cannot disagree.
 */
const impl = implement(contract).$context<ApiContext>()
const base = os.$context<ApiContext>()

/** Adds `db` so no handler repeats `drizzle(c.env.DB, { schema })`. */
export const pub = impl.use(async ({ context, next }) =>
  next({ context: { ...context, db: database(context.env) } }),
)

/** Signed in. 401 rather than 403: the caller may simply not have logged in. */
export const authed = pub.use(async ({ context, next }) => {
  if (!context.user) throw new ORPCError("UNAUTHORIZED", { message: "Unauthorized" })
  return next({ context: { ...context, user: context.user } })
})

/** Platform-wide: may this actor type touch this resource at all? */
export function requirePermission(resource: string, action: string) {
  return base.middleware(async ({ context, next }) => {
    const role = (context.user?.role || "user") as keyof typeof roles
    const definition = roles[role]
    if (!definition) throw new ORPCError("FORBIDDEN", { message: "Forbidden" })

    const result = (definition.authorize as (p: Record<string, string[]>) => { error?: unknown })({
      [resource]: [action],
    })
    if (result.error) throw new ORPCError("FORBIDDEN", { message: "Forbidden" })
    return next()
  })
}

/**
 * Object-scoped: does this caller stand in the right relation to this object?
 *
 * `orgIdFrom` returning null means the target does not exist. That is a 404,
 * not a 403 — saying "forbidden" for a missing id tells a caller which ids are
 * real.
 */
export function requireOrgMember<TInput>(
  orgIdFrom: (input: TInput, db: Db) => Promise<string | null> | string | null,
  minRole: OrgRole = "member",
) {
  return base.middleware(async ({ context, next }, input: unknown) => {
    const db = database(context.env)
    const orgId = await orgIdFrom(input as TInput, db)
    if (!orgId) throw new ORPCError("NOT_FOUND", { message: "Not found" })

    // Platform admins are not members of every school and bypass by design.
    if (context.user?.role === "admin") return next()

    const role = await orgRoleFor(context.env, context.user!.id, orgId)
    if (!role) throw new ORPCError("FORBIDDEN", { message: "Not a member of this organization" })
    if (rankOf(role) > rankOf(minRole)) {
      throw new ORPCError("FORBIDDEN", { message: `Requires ${minRole} in this organization` })
    }
    return next()
  })
}

/** The org that owns a team, for update/delete. */
export const orgOfTeam = async (input: { id: string }, db: Db) => {
  const row = await db
    .select({ orgId: schema.team.orgId })
    .from(schema.team)
    .where(eq(schema.team.id, input.id))
    .get()
  return row?.orgId ?? null
}

/** Ownership of an event, by its creator. */
export function requireOwner() {
  return base.middleware(async ({ context, next }, input: unknown) => {
    const { id } = input as { id: string }
    const db = database(context.env)
    const row = await db
      .select({ createdBy: schema.event.createdBy })
      .from(schema.event)
      .where(eq(schema.event.id, id))
      .get()
    if (!row) throw new ORPCError("NOT_FOUND", { message: "Not found" })
    if (context.user?.role !== "admin" && row.createdBy !== context.user!.id) {
      throw new ORPCError("FORBIDDEN", { message: "Forbidden" })
    }
    return next()
  })
}
