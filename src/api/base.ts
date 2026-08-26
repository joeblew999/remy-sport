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

import { ORPCError, os } from "@orpc/server"
import type { OpenAPIV3_1 } from "openapi-types"
import { drizzle } from "drizzle-orm/d1"
import { eq } from "drizzle-orm"
import * as schema from "../db/schema"
import { roles } from "../auth/access-control"
import { createAuth } from "../auth"
import { orgRoleFor, rankOf, type OrgRole } from "../middleware/require-org-member"
import type { Bindings } from "../types"

export interface ApiContext {
  env: Bindings
  /** The raw request. `authed` resolves the session from its headers. */
  request: Request
}

export type SessionUser = { id: string; name?: string | null; role?: string | null }

export type Db = ReturnType<typeof database>
export const database = (env: Bindings) => drizzle(env.DB, { schema })

const base = os.$context<ApiContext>()

/**
 * Marks an operation as requiring a session, in the published document.
 *
 * Security schemes are declared once on the document (src/index.ts); this says
 * which operations demand them. Written as a route option rather than
 * remembered per handler, so a protected operation cannot be documented as
 * public — which is what an integrator reads before calling it.
 */
export const authedRoute = {
  spec: (operation: OpenAPIV3_1.OperationObject): OpenAPIV3_1.OperationObject => ({
    ...operation,
    security: [{ Session: [] }, { ApiKey: [] }],
    responses: {
      ...operation.responses,
      401: { description: "Not signed in" },
      403: { description: "Signed in, but not permitted" },
    },
  }),
}

/** Adds `db` so no handler repeats `drizzle(c.env.DB, { schema })`. */
export const pub = base.use(async ({ context, next }) =>
  next({ context: { ...context, db: database(context.env) } }),
)

/**
 * Signed in — and this is where the session is actually resolved.
 *
 * `auth.api.getSession({ headers })` is called here rather than in a Hono
 * middleware mounted on `*`. That old arrangement asked D1 for a session on
 * every request the Worker saw, including each hashed JS and CSS bundle falling
 * through to the asset store. Resolving it inside the one base builder that
 * needs it means a public read costs nothing, and `session.cookieCache`
 * (auth.config.ts) collapses the repeats within a page load.
 *
 * 401 rather than 403: the caller may simply not have logged in.
 */
export const authed = pub.use(async ({ context, next }) => {
  const auth = createAuth({ env: context.env, req: { url: context.request.url } })
  const session = await auth.api.getSession({ headers: context.request.headers })
  const user = session?.user as SessionUser | undefined
  if (!user) throw new ORPCError("UNAUTHORIZED", { message: "Unauthorized" })
  return next({ context: { ...context, user } })
})

/** Platform-wide: may this actor type touch this resource at all? */
export function requirePermission(resource: string, action: string) {
  return base
    .$context<ApiContext & { user: SessionUser }>()
    .middleware(async ({ context, next }) => {
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
  return base
    .$context<ApiContext & { user: SessionUser }>()
    .middleware(async ({ context, next }, input: unknown) => {
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
  return base
    .$context<ApiContext & { user: SessionUser }>()
    .middleware(async ({ context, next }, input: unknown) => {
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
