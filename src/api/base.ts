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
import { GRANTS } from "../domain/vocabularies"
import { database, type Db } from "./db"
import {
  eventIdsFor,
  eventTypesOf,
  heldAmong,
  holds,
  objectExists,
  objectTableFor,
} from "./relations"
import { createAuth } from "../auth"
import type { Bindings } from "../types"

export interface ApiContext {
  env: Bindings
  /** The raw request. `authed` resolves the session from its headers. */
  request: Request
}

export type SessionUser = { id: string; name?: string | null; role?: string | null }

/**
 * The viewer's own clock, as Cloudflare resolved it — "Asia/Bangkok".
 *
 * `request.cf.timezone` comes from the edge on every Worker request, so it
 * costs nothing and needs no library. It is absent under `wrangler dev` and in
 * the test pool, and absent is a real answer rather than a failure: a page that
 * does not know the reader's zone shows the venue's clock alone, which is what
 * a schedule meant before anyone thought about zones.
 *
 * A guess from an IP, not a preference. It is right for "what time is this for
 * me" and wrong as a stored setting, which is why nothing writes it down.
 */
export function viewerTimezone(request: Request): string | null {
  const cf = (request as Request & { cf?: { timezone?: string } }).cf
  return cf?.timezone ?? null
}

// Re-exported so the `type Db` imports across src/api keep pointing at
// src/api/base — the type moved to break a cycle, not to be relocated in every
// caller.
export { database, type Db }

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

/**
 * The row, or a 404 — written once instead of nine times.
 *
 * Every handler that reads a row back after a write repeated
 * `if (!row) throw new ORPCError("NOT_FOUND", { message: "Not found" })`, and a
 * repeated literal is a place for one of them to word it differently. It also
 * narrows the type, which is the reason the line existed at all.
 *
 * Deliberately says nothing about *why*. Whether the id never existed or the
 * caller may not see it is a question the authorisation layer has already
 * answered; a handler that distinguished them here would leak the difference.
 */
export function found<T>(row: T | null | undefined): T {
  if (!row) throw new ORPCError("NOT_FOUND", { message: "Not found" })
  return row
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
  const auth = createAuth({
    env: context.env,
    req: { url: context.request.url },
    headers: context.request.headers,
    cf: (context.request as Request & { cf?: { city?: string; country?: string; region?: string; asOrganization?: string } }).cf,
  })
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
  const auth = createAuth({
    env: context.env,
    req: { url: context.request.url },
    headers: context.request.headers,
    cf: (context.request as Request & { cf?: { city?: string; country?: string; region?: string; asOrganization?: string } }).cf,
  })
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
 *
 * `eventContext` is for the actions that are about a *pair*. Registering a team
 * asks two things of two different objects: are you this team's coach, and is
 * this event one you may enter. The relation resolves against the team; the
 * `eventTypes` narrowing belongs to the event, and only the caller knows which
 * event that is. Where the object's own type declares an EVENT parent — a game
 * — it is derived instead and this stays undefined.
 */
type Grant = { relation: string; eventTypes: readonly string[] }

const grantsFor = (action: keyof typeof GRANTS) =>
  (GRANTS[action] ?? []) as ReadonlyArray<Grant>

/**
 * The grants that need no object: a role comparison, no query.
 *
 * `CREATE_EVENT` is the shape — a PLATFORM action, granted to ANY_ORGANIZER and
 * PLATFORM_ADMIN, with nothing to be in a relation *to*. Answered first because
 * when it is true nothing else needs asking, whatever the object.
 */
async function holdsPlatformGrant(
  db: Db,
  action: keyof typeof GRANTS,
  viewer: { id: string; role?: string | null },
): Promise<boolean> {
  for (const g of grantsFor(action)) {
    if (!g.eventTypes.length && (await holds(db, g.relation, viewer, null))) return true
  }
  return false
}

/**
 * Which of these objects may the user act on?
 *
 * The list form, and the one that does the work — `can` is this with a single
 * id. Two implementations of authorisation that could disagree would be a worse
 * outcome than any latency, so there is one.
 *
 * ## Why this exists
 *
 * `/api/games?eventId=evt_002` took **246ms** for 28 rows, against 11ms for the
 * four rows of `/api/events`. Stubbing `can` took it to 10ms, so ~96% of it was
 * here. The cost was structural rather than slow code: `serialize` asks four
 * questions per game, every grant on them names `GAME_EVENT_OWNER` or
 * `GAME_EVENT_CO_ORGANIZER` — `via: "parent"`, so a hop to the event and a join
 * — and each also narrows by `eventTypes`, which resolved the subtype again per
 * call. Around 700 reads to render one schedule.
 *
 * Nothing here is per row. The parents resolve in one query, their subtypes in
 * one more, and each relation answers for the whole list at once through
 * `heldAmong`. A schedule costs about six reads whatever its length.
 *
 * The comment this replaces said the fix "then is to answer it in one query —
 * the relations are all derivable in SQL — not to move the decision into the
 * client". That is what this is; the decision has not moved.
 */
export async function canAll(
  db: Db,
  action: keyof typeof GRANTS,
  user: SessionUser | null,
  objectIds: readonly string[],
  eventContext?: string | null,
): Promise<Set<string>> {
  const grants = grantsFor(action)
  // Fails closed: an action with no grants permits nobody.
  if (!grants.length || objectIds.length === 0) return new Set()

  const viewer = user ?? { id: "", role: null }

  // True for every object or none of them, and cheapest to ask.
  if (await holdsPlatformGrant(db, action, viewer)) return new Set(objectIds)

  const ids = [...new Set(objectIds)]

  /**
   * Some grants apply only to certain event subtypes — a camp has no brackets
   * to generate. Resolved once for the whole list, and only if one asks.
   *
   * The event is not always the object: a GAME action carries a game id and the
   * subtype belongs to the event above it. `eventIdsFor` reads that hop off the
   * model rather than assuming the two are the same, which is what once silently
   * denied ENTER_SCORES to everybody.
   */
  let subtypeOf: Map<string, string | null> = new Map()
  if (grants.some((g) => g.eventTypes.length)) {
    const eventOf =
      eventContext !== undefined
        ? new Map(ids.map((id) => [id, eventContext]))
        : await eventIdsFor(db, action, ids)
    const eventIds = [...new Set([...eventOf.values()].filter((e): e is string => !!e))]
    const types = await eventTypesOf(db, eventIds)
    subtypeOf = new Map(
      ids.map((id) => {
        const eventId = eventOf.get(id)
        return [id, eventId ? (types.get(eventId) ?? null) : null]
      }),
    )
  }

  const allowed = new Set<string>()
  for (const g of grants) {
    // Narrowed grants only apply to the rows whose subtype matches, so the
    // relation is asked about those and no others.
    const scope = g.eventTypes.length
      ? ids.filter((id) => {
          const subtype = subtypeOf.get(id)
          return !!subtype && g.eventTypes.includes(subtype)
        })
      : ids
    const remaining = scope.filter((id) => !allowed.has(id))
    if (remaining.length === 0) continue
    for (const id of await heldAmong(db, g.relation, viewer, remaining)) allowed.add(id)
  }
  return allowed
}

/**
 * May this user do this to this object?
 *
 * `canAll` with one id, so there is a single set of rules rather than a pair
 * that can drift. `objectId` is null for a PLATFORM action, where there is
 * nothing to be in a relation to and only the role grants can answer.
 */
export async function can(
  db: Db,
  action: keyof typeof GRANTS,
  user: SessionUser | null,
  objectId: string | null,
  eventContext?: string | null,
): Promise<boolean> {
  if (!objectId) {
    if (!grantsFor(action).length) return false
    return holdsPlatformGrant(db, action, user ?? { id: "", role: null })
  }
  return (await canAll(db, action, user, [objectId], eventContext)).has(objectId)
}

/**
 * The mark every procedure must carry, and how `mise run check:authz` reads it.
 *
 * Model-driven authorisation only works if it cannot be skipped, and until
 * 2026-08-28 it could: `requireAction` was something a person remembered to
 * add, and forty-seven procedures declared nothing at all. Web Push shipped
 * with no authorisation of any kind and no check noticed, because there was
 * nothing to notice with — "protected" and "somebody forgot" looked identical.
 *
 * So every procedure now attaches one of these to a middleware, and the check
 * walks the real router and fails the build on any procedure that carries
 * none. The four kinds are exhaustive on purpose: `open` and `infrastructure`
 * are escape hatches, and being enumerable is what makes them reviewable.
 */
export type Policy =
  /** Enforced by `requireAction` against the model. The normal case. */
  | { kind: "action"; action: string }
  /** Public, and the model agrees: the action is granted to PUBLIC. Verified. */
  | { kind: "open"; action: string }
  /** The handler calls `can()` itself, because the action depends on the input. */
  | { kind: "handler"; actions: readonly string[] }
  /** Not a domain object at all — health, vocabularies. Named, so it is countable. */
  | { kind: "infrastructure"; why: string }
  /** The model permits more than we do. Deliberate, and reported every run. */
  | { kind: "stricter"; action: string; why: string }

const POLICY = Symbol.for("remy.policy")

/** Attach a policy to a middleware so the router walk can find it. */
function marked<T extends object>(middleware: T, policy: Policy): T {
  Object.defineProperty(middleware, POLICY, { value: policy, enumerable: false })
  return middleware
}

/** Read a policy off a middleware, for scripts/check-authz.ts. */
export function policyOf(middleware: unknown): Policy | null {
  return (middleware as Record<symbol, Policy> | null)?.[POLICY] ?? null
}

/**
 * A read the model grants to PUBLIC, declared rather than assumed.
 *
 * Serving something without a session is a decision, and this is where it is
 * recorded. It is checked against the model at module load, so the day the
 * Product Owner decides events are members-only, this throws on the first
 * request instead of continuing to serve them to everyone.
 */
export function openTo(action: keyof typeof GRANTS) {
  const grants = (GRANTS as Record<string, ReadonlyArray<{ relation: string }>>)[action] ?? []
  if (!grants.some((g) => g.relation === "PUBLIC")) {
    throw new Error(
      `openTo(${action}): the model does not grant this to PUBLIC, so it must not be served ` +
        "without a session. Use requireAction instead.",
    )
  }
  return marked(
    base.$context<ApiContext>().middleware(({ next }) => next()),
    { kind: "open", action },
  )
}

/**
 * We are deliberately narrower than the model, and this says so out loud.
 *
 * `VIEW_PLAYER` is granted to PUBLIC, but a player list names minors and their
 * jersey numbers, so `/api/players` is behind a session. Being stricter than
 * the model is safe; being stricter *silently* is how a model stops describing
 * the system. `mise run check:authz` prints every one of these, so the
 * disagreement stays in front of whoever owns the model.
 */
export function stricterThanModel(action: keyof typeof GRANTS, why: string) {
  return marked(
    base.$context<ApiContext>().middleware(({ next }) => next()),
    { kind: "stricter", action, why },
  )
}

/**
 * The handler decides, because the action depends on the input.
 *
 * `follow` acts on a team, an event or a player, and which action governs it is
 * only known once the input is read. Listing them here keeps the procedure
 * countable by the check and greppable by a person.
 */
export function checkedInHandler(...actions: (keyof typeof GRANTS)[]) {
  return marked(
    base.$context<ApiContext>().middleware(({ next }) => next()),
    { kind: "handler", actions },
  )
}

/**
 * Not a domain object: health, the published vocabularies, the seed route.
 *
 * The narrowest escape hatch, and the reason it takes a sentence rather than a
 * boolean — an unexplained one is the thing this whole mechanism exists to
 * prevent.
 */
export function infrastructure(why: string) {
  return marked(
    base.$context<ApiContext>().middleware(({ next }) => next()),
    { kind: "infrastructure", why },
  )
}

export function requireAction(
  action: keyof typeof GRANTS,
  idFrom: (input: never) => string = defaultId as (input: never) => string,
  /**
   * Which event narrows this grant, for the actions that are about a pair.
   * `registerTeam` acts on a team but is entering an event, and only the input
   * says which. Omitted everywhere else, where the event is the object or is
   * derived from it.
   */
  eventFrom?: (input: never) => string | null,
) {
  return marked(base
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

      const eventContext = eventFrom
        ? (eventFrom as (i: unknown) => string | null)(input)
        : undefined
      if (await can(db, action, user, objectId, eventContext)) return next()
      throw new ORPCError("FORBIDDEN", { message: "Forbidden" })
    }), { kind: "action", action })
}





