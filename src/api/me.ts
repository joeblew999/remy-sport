/**
 * What the signed-in person is connected to.
 *
 * The app could ask two questions about anything — *all of them*, and *this one
 * by id* — and never *mine*. So every screen meaning "yours" faked it: the
 * profile filtered every event on the platform by `canEdit` and called the
 * result yours, `#/team` with no id showed whichever team sorted first, and a
 * referee had no screen for their assignments at all because one could not be
 * written.
 *
 * The answer was already here. `objectsHeldBy` is a ReBAC **ListObjects** —
 * which objects does this user hold this relation to — and `events.mine` has
 * been calling it for three of the seventeen relations. This exposes all of
 * them, once, so no screen has to invent the question again.
 *
 * ## Ids, not rows
 *
 * Hydrating here would make one procedure depend on every entity's serialiser,
 * its permissions and its facts — a god endpoint that changes whenever anything
 * does. Ids keep it ignorant of what the things are: it reads relations and
 * nothing else. Screens join against lists they already hold, which for teams,
 * events and orgs is every row there will ever be.
 *
 * ## Why the derived relations are missing
 *
 * Two relations are `via: "parent"` — you hold a game because you own the event
 * it belongs to. `objectsHeldBy` returns nothing for those by construction, and
 * that is the right answer rather than a gap to fill. They are the high fan-out
 * case: an organiser holds every game in every event they run, 29 today and
 * thousands across seasons, which is the documented limit of ListObjects in
 * every system that has one. An organiser reaches their games through the
 * event, which is one query and already exists.
 */
import { z } from "zod"
import { eq } from "drizzle-orm"
import * as schema from "../db/schema"
import { authed, can, infrastructure } from "./base"
import { objectsHeldBy } from "./relations"
import { ACTION, GRANTS, RELATION, STORED_ROLE } from "../domain/vocabularies"

/**
 * Every relation a person can hold on a specific thing, read off the model.
 *
 * Derived rather than listed, so a relation the PO adds is answered the day it
 * exists. A hardcoded array here would be a second copy of the model that
 * silently disagrees with it — which is the shape of every bug this file was
 * written to end.
 *
 * `via: "table"` is the whole filter, and it excludes everything that should be
 * excluded on its own: `role` and `everyone` relations are not held on an object,
 * and `parent` ones cannot be answered by ListObjects. A second test for
 * `objectTypeCode !== "PLATFORM"` was written here and the compiler rejected it
 * as unreachable — every table-backed relation is already on a specific thing,
 * which is the model saying the filter is exactly right.
 */
const HELD = RELATION.filter((r) => r.via === "table").map((r) => ({
  code: r.code,
  type: r.objectTypeCode,
}))

/**
 * The platform-wide actions, derived — not a list somebody typed.
 *
 * These are the grants with no object to act upon: may I manage users, moderate
 * listings, approve a referee, create an event. The admin console decided this
 * itself with `role === "admin"`, which is a second copy of a rule the model
 * owns — `MANAGE_ALL_USERS` is granted to PLATFORM_ADMIN there, and a screen
 * re-deriving it from a role string is how the two come to disagree.
 *
 * `events.list` already carries `canCreate` for exactly this reason, and its
 * note says so: the admin console "decided this from a role table copied into
 * the client, which is a second answer to a question the model already
 * answers".
 */
const PLATFORM_ACTIONS = ACTION.filter(
  (a) => a.objectTypeCode === "PLATFORM" && a.code in GRANTS,
).map((a) => a.code as keyof typeof GRANTS)

const Holding = z.object({
  /** EVENT, TEAM, PLAYER, GAME or ORG — the model's own object type. */
  type: z.string(),
  id: z.string(),
  /** Which relation. A coach and a follower both hold a team, differently. */
  relation: z.string(),
})

export const mine = authed
  .route({
    method: "GET",
    path: "/me/mine",
    summary: "Everything I am connected to, and how",
  })
  .output(
    z.object({
      holdings: z.array(Holding),
      /** Platform actions this person holds — no object, so no id to check. */
      can: z.record(z.string(), z.boolean()),
    }),
  )
  /**
   * `infrastructure`, because there is no object here to act upon.
   *
   * Every other procedure names an action and an object. This one asks the
   * resolver which objects the caller holds — so **the authorisation is the
   * query**: a row can only appear because the caller holds a relation to it,
   * and there is no input that could widen that. An action check would be a
   * second, weaker gate in front of a stronger one.
   *
   * `check-authz` was right to refuse the first version of this, which declared
   * nothing and explained itself in a comment. A procedure that declares nothing
   * is not public, it is unreviewed — so the escape hatch is taken openly, with
   * the reason in the string where the checker can see it.
   *
   * Nor can it leak: looking is public in this product. `GRANTS` opens
   * VIEW_EVENT, VIEW_TEAM and VIEW_PLAYER to anyone, so these ids are not
   * secrets. What is yours is relevance here, not privacy.
   */
  .use(
    infrastructure(
      "no object to check: this returns the caller's own relations, so the " +
        "resolver's answer is itself the authorisation",
    ),
  )
  .handler(async ({ context }) => {
    // One query per relation, in parallel — the shape `canAll` and `events.mine`
    // both use. Fifteen small indexed reads against tiny tables.
    const found = await Promise.all(
      HELD.map((r) => objectsHeldBy(context.db, r.code, context.user.id)),
    )
    // The platform grants, in parallel with the relations. `can(..., null)`
    // resolves these against the model rather than against a role string.
    const allowed = await Promise.all(
      PLATFORM_ACTIONS.map((a) => can(context.db, a, context.user, null)),
    )

    return {
      holdings: HELD.flatMap((r, i) =>
        found[i]!.map((id) => ({ type: r.type, id, relation: r.code })),
      ),
      can: Object.fromEntries(PLATFORM_ACTIONS.map((a, i) => [a, allowed[i]!])),
    }
  })

/**
 * The roles a person may take for themselves, read off the grants.
 *
 * `SIGN_UP_AS_COACH`, `_PLAYER`, `_ORGANIZER`, `_SPECTATOR` and
 * `_REFEREE_REQUEST` are all granted to PUBLIC in the model — the PO's decision
 * that anybody may say what they are. Derived rather than listed, so removing
 * one upstream removes it here without anybody remembering to.
 *
 * The referee is the exception the model names in its own code: a *request*,
 * not an assumption. It lands `PENDING_APPROVAL`, which `session.create` already
 * refuses to act on, `main.tsx` already explains to the person waiting, and
 * `admin.approveReferee` already resolves. Three of the four pieces existed and
 * only the request was missing.
 */
const SELF_ASSIGNABLE = new Map<string, { role: string; pending: boolean }>(
  (Object.keys(GRANTS) as string[])
    .filter((a) => a.startsWith("SIGN_UP_AS_"))
    .map((a) => {
      const request = a.endsWith("_REQUEST")
      const name = a.replace("SIGN_UP_AS_", "").replace("_REQUEST", "")
      return [name, { role: STORED_ROLE[name as keyof typeof STORED_ROLE], pending: request }] as const
    })
    .filter(([, v]) => Boolean(v.role)),
)

export const chooseRole = authed
  .route({ method: "POST", path: "/me/role", summary: "Say what you are" })
  .input(z.object({ roleCode: z.enum([...SELF_ASSIGNABLE.keys()] as [string, ...string[]]) }))
  .output(z.object({ role: z.string(), statusCode: z.string() }))
  /**
   * `infrastructure`, and the check is in the handler, because the guard is not
   * an action on an object — it is *who you already are*.
   *
   * Only a spectator may choose. That is the default a new account gets
   * (`auth.config.ts` assigns it in `user.create.before`), so this is the
   * sign-up question asked late rather than a way to change role: a coach cannot
   * promote themselves to organiser, and nobody can reach admin at all, because
   * ADMIN is not granted to PUBLIC and so is not in the map above.
   */
  .use(
    infrastructure(
      "no object to check: this sets the caller's own role, and only while it " +
        "is still the default a new account gets",
    ),
  )
  .handler(async ({ context, input }) => {
    const chosen = SELF_ASSIGNABLE.get(input.roleCode)!
    const [current] = await context.db
      .select({ role: schema.user.role, statusCode: schema.user.statusCode })
      .from(schema.user)
      .where(eq(schema.user.id, context.user.id))

    // Anyone who is already something keeps it. Silent rather than an error:
    // the screen only offers this to a spectator, so reaching here means a
    // stale page, and telling somebody their own role is "wrong" helps nobody.
    if (current?.role !== STORED_ROLE.SPECTATOR) {
      return { role: current?.role ?? "", statusCode: current?.statusCode ?? "" }
    }

    const statusCode = chosen.pending ? "PENDING_APPROVAL" : "ACTIVE"
    await context.db
      .update(schema.user)
      .set({ role: chosen.role, statusCode })
      .where(eq(schema.user.id, context.user.id))

    return { role: chosen.role, statusCode }
  })
