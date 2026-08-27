/**
 * The oRPC base: one context, and authorisation as one middleware.
 *
 * Every procedure is built from `pub` (open) or `authed` (signed in), and a
 * write adds `.use(requireAction(...))` — explicit on the procedure that needs
 * it, so a protected operation cannot be quietly unprotected.
 *
 * This used to be two questions: `requirePermission` for the actor type and
 * `requireOrgMember` / `requireOwner` for the object. That shape was right, but
 * the answers were hand-written beside a machine-readable model of the same
 * thing, and drifted from it. Now the PO's compiled grants name the relations
 * that satisfy an action, and the relations resolve themselves — see
 * ./relations.ts. Who may do what is an edit in remy-sport-biz, not here.
 */

import { ORPCError, os } from "@orpc/server"
import type { OpenAPIV3_1 } from "openapi-types"
import { drizzle } from "drizzle-orm/d1"
import { eq } from "drizzle-orm"
import * as schema from "../db/schema"
import { GRANTS } from "../domain/vocabularies"
import { holds, objectExists, objectTableFor } from "./relations"
import { createAuth } from "../auth"
import type { Bindings } from "../types"

export interface ApiContext {
  env: Bindings
  /** The raw request. `authed` resolves the session from its headers. */
  request: Request
}

export type SessionUser = { id: string; name?: string | null; role?: string | null }

export type Db = ReturnType<typeof database>
const database = (env: Bindings) => drizzle(env.DB, { schema })

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

/**
 * Public, but aware of who is asking — `user` is null for a stranger.
 *
 * For a read that anyone may make but whose *response* depends on the reader:
 * `orgs.get` is public and returns `canEdit`, so the page can offer a Save
 * button only to someone it will work for.
 *
 * Not the default. It costs the session lookup `pub` exists to avoid, and most
 * public reads return the same bytes to everybody — see the note above on what
 * that lookup used to cost when it ran for every asset request.
 */
export const viewer = pub.use(async ({ context, next }) => {
  const auth = createAuth({ env: context.env, req: { url: context.request.url } })
  const session = await auth.api.getSession({ headers: context.request.headers })
  return next({ context: { ...context, user: (session?.user as SessionUser) ?? null } })
})

/**
 * May this user perform this action on this object?
 *
 * One middleware, replacing `requirePermission` + `requireOwner` /
 * `requireOrgMember`. It reads the PO's compiled grants: the action names the
 * relations that satisfy it, and the caller needs **any one** of them.
 *
 * Nothing here is a policy decision. `GRANTS` is generated from
 * the model's GRANTS, and the relations resolve themselves from their own
 * structured derivation, so changing who may do what is an edit upstream, not a
 * code change. That is the whole point: the previous arrangement restated a
 * fraction of the same policy by hand, in a different shape, and drifted.
 *
 * `objectFrom` returning null is a 404, not a 403 — answering "forbidden" for an
 * id that does not exist tells a caller which ids are real.
 *
 * Fails closed. An action with no grants forbids everyone.
 */
/**
 * Where the object's id sits in the input. `{ id }` for every route so far.
 *
 * Kept as an override rather than assumed, because a route that acts on one
 * object while carrying another's id in `id` will exist eventually — but it does
 * not yet, and a parameter nobody passes is better than one everybody passes.
 */
const defaultId = (input: { id?: string }) => input.id ?? ""

/**
 * May this user take this action on this object? The same question
 * `requireAction` asks, answered rather than enforced.
 *
 * It exists because a page needs it too. `org.tsx` shows a Save button on a
 * profile, and until this existed it had no way to know whether saving would
 * work — so a coach at another school was offered a control that 403s. The fix
 * is not for the client to work it out from the viewer's role: that is a second
 * copy of the access matrix, which is the drift this whole file exists to
 * remove. The server already knows, so the server says.
 *
 * `user` is null for a signed-out viewer, who holds exactly the relations
 * granted to everyone. The sentinel below is what expresses that: `PUBLIC`
 * resolves true, a role comparison resolves false, and a table lookup matches
 * no row because no row has an empty user id.
 *
 * Says nothing about whether the object exists — that is a 404, and a different
 * question. `requireAction` keeps it.
 */
export async function can(
  db: Db,
  action: keyof typeof GRANTS,
  user: SessionUser | null,
  objectId: string | null,
): Promise<boolean> {
  const grants = GRANTS[action] as ReadonlyArray<{
    relation: string
    eventTypes: readonly string[]
  }>
  // Fails closed: an action with no grants permits nobody.
  if (!grants?.length) return false

  const viewer = user ?? { id: "", role: null }

  // Platform relations first: a role comparison, no object and no query.
  for (const g of grants) {
    if (!g.eventTypes.length && (await holds(db, g.relation, viewer, null))) return true
  }
  if (!objectId) return false

  // Some grants apply only to certain event subtypes — a camp has no brackets
  // to generate. Resolve the subtype once, only if one asks.
  let subtype: string | null | undefined
  if (grants.some((g) => g.eventTypes.length)) {
    const row = await db
      .select({ typeCode: schema.event.typeCode })
      .from(schema.event)
      .where(eq(schema.event.id, objectId))
      .get()
    subtype = row?.typeCode ?? null
  }

  for (const g of grants) {
    if (g.eventTypes.length && !(subtype && g.eventTypes.includes(subtype))) continue
    if (await holds(db, g.relation, viewer, objectId)) return true
  }
  return false
}

export function requireAction(
  action: keyof typeof GRANTS,
  idFrom: (input: never) => string = defaultId as (input: never) => string,
) {
  return base
    .$context<ApiContext & { user: SessionUser }>()
    .middleware(async ({ context, next }, input: unknown) => {
      const db = database(context.env)
      const user = context.user!

      // A platform relation needs no object, so it can answer before there is
      // one to look up — `CREATE_TEAM` acts on a team that does not exist yet.
      if (await can(db, action, user, null)) return next()

      // Which table this action acts on comes from the action itself: it
      // declares an object type, and the type declares its table. A PLATFORM
      // action has none, and reaching here means no relation granted it.
      const table = objectTableFor(action)
      if (!table) throw new ORPCError("FORBIDDEN", { message: "Forbidden" })

      // The 404 is the part `can` deliberately does not do. Answering
      // "forbidden" for an id that does not exist tells a caller which ids are
      // real, so existence is checked before permission is refused.
      const objectId = (idFrom as (i: unknown) => string)(input)
      if (!objectId || !(await objectExists(db, table, objectId))) {
        throw new ORPCError("NOT_FOUND", { message: "Not found" })
      }

      if (await can(db, action, user, objectId)) return next()
      throw new ORPCError("FORBIDDEN", { message: "Forbidden" })
    })
}





