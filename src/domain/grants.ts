/**
 * The grant table, applied. The pure half of authorisation.
 *
 * `GRANTS` says which relations satisfy an action; `RELATION` says how each is
 * derived. Resolving *which relations a person holds* needs the database and
 * lives in src/api/relations.ts. Everything after that point — given the
 * relations held, which actions are allowed — is a lookup in the model, and this
 * file is that lookup, with no database in reach.
 *
 * Two callers, on purpose. The server resolves relations from D1 and applies
 * this; a render fixture states the relations and applies the same function.
 * So a fixture can only describe a state the model produces, and a screen is
 * tested against one of the six kinds of team page that can exist rather than
 * against a hand-planted `canEdit: true` beside a `canManage: false` that no
 * relation yields.
 *
 * What a screen receives is the *answer* — `can.MANAGE_ROSTER` — never this
 * table. The SPA must not import this module: a component that branched on
 * "am I the head coach" would be a second copy of GRANTS, which is the drift the
 * whole resolver exists to prevent. `.dependency-cruiser.cjs` refuses it.
 */
import { ACTION, GRANTS, OBJECT_TYPE, RELATION, STORED_ROLE } from "./vocabularies"

type ActionRow = (typeof ACTION)[number]
type RelationRow = (typeof RELATION)[number]
type ObjectTypeRow = (typeof OBJECT_TYPE)[number]
type Grants = typeof GRANTS

export type ActionCode = ActionRow["code"]
export type RelationCode = RelationRow["code"]
export type ObjectTypeCode = ObjectTypeRow["code"]

/** The actions the model declares on one object type. */
export type ActionOf<T extends ObjectTypeCode> = Extract<ActionRow, { objectTypeCode: T }>["code"]

/**
 * An action about a *pair*, which no single row can answer.
 *
 * `REGISTER_TEAM_FOR_EVENT` acts on a TEAM and is narrowed by the subtype of an
 * EVENT the team is not part of — the model can only name one object, so the
 * event arrives as context from the caller. A team row therefore cannot carry
 * the answer; the registration row, which knows both, does.
 *
 * Derived by rule rather than named: an action narrowed by event subtype whose
 * object is neither an event nor inside one. Today that is exactly two.
 */
type EventLike = "EVENT" | Extract<ObjectTypeRow, { parentTypeCode: "EVENT" }>["code"]
type Narrowed = {
  [K in keyof Grants]: Grants[K][number]["eventTypes"] extends readonly [] ? never : K
}[keyof Grants]
export type PairAction = Exclude<Narrowed & ActionCode, ActionOf<EventLike> | ActionOf<"PLATFORM">>

/** The actions a row of this type answers for its reader. */
export type PerRowAction<T extends ObjectTypeCode> = Exclude<ActionOf<T>, PairAction>

/**
 * An action whose every grant is platform-wide: answerable from the session,
 * with no object to look up. `DELETE_PLAYER` is one — it names PLAYER, but its
 * only grant is PLATFORM_ADMIN, so whether you may delete a player does not
 * depend on which one.
 */
type PlatformRelation = Extract<RelationRow, { objectTypeCode: "PLATFORM" }>["code"]
export type PlatformAction = {
  [K in keyof Grants]: Grants[K][number]["relation"] extends PlatformRelation ? K : never
}[keyof Grants] &
  ActionCode

type Grant = { relation: string; eventTypes: readonly string[] }
const grantsOf = (action: string): readonly Grant[] =>
  (GRANTS as Record<string, readonly Grant[]>)[action] ?? []

const EVENT_LIKE: ReadonlySet<string> = new Set(
  OBJECT_TYPE.filter((t) => t.code === "EVENT" || t.parentTypeCode === "EVENT").map((t) => t.code),
)
const PLATFORM_RELATIONS: ReadonlySet<string> = new Set(
  RELATION.filter((r) => r.objectTypeCode === "PLATFORM").map((r) => r.code),
)

/** The runtime form of `PairAction` — the same rule, applied to the rows. */
export function isPairAction(a: ActionRow): boolean {
  return (
    a.objectTypeCode !== "PLATFORM" &&
    !EVENT_LIKE.has(a.objectTypeCode) &&
    grantsOf(a.code).some((g) => g.eventTypes.length > 0)
  )
}

export const PER_ROW_ACTIONS = Object.fromEntries(
  OBJECT_TYPE.map((t) => [
    t.code,
    ACTION.filter((a) => a.objectTypeCode === t.code && !isPairAction(a)).map((a) => a.code),
  ]),
) as unknown as { readonly [T in ObjectTypeCode]: readonly PerRowAction<T>[] }

export const PLATFORM_ACTIONS = ACTION.filter((a) => {
  const grants = grantsOf(a.code)
  // An action with no grants permits nobody; asking would be a query whose
  // answer the model has already given.
  return grants.length > 0 && grants.every((g) => PLATFORM_RELATIONS.has(g.relation))
}).map((a) => a.code) as readonly PlatformAction[]

/**
 * Does the session alone hold this platform relation?
 *
 * `role` compares against what Better Auth stores. `everyone` is two relations
 * the model derives identically and means differently: PUBLIC is anyone at all,
 * ANY_SIGNED_IN is anyone with an account. The derivation column cannot tell
 * them apart, so this does — a stranger holds PUBLIC and nothing else. Until
 * this existed a signed-out reader "held" ANY_SIGNED_IN and `can(FOLLOW_EVENT)`
 * said yes, which no public read happened to surface.
 */
export function holdsPlatform(
  r: RelationRow,
  user: { id: string; role?: string | null } | null,
): boolean {
  if (r.via === "role") return user?.role === STORED_ROLE[r.roleCode as keyof typeof STORED_ROLE]
  if (r.via === "everyone") return r.code === "PUBLIC" || Boolean(user?.id)
  return false
}

/** Every platform relation the session holds — no object, no query. */
export function platformRelations(
  user: { id: string; role?: string | null } | null,
): Set<RelationCode> {
  return new Set(RELATION.filter((r) => holdsPlatform(r, user)).map((r) => r.code))
}

/**
 * Does any grant of this action name a relation the reader holds, within the
 * event subtype where the grant applies? `subtype` is null where there is no
 * event to narrow by, which is the case for a PLATFORM action and for a team.
 */
export function grantAllows(
  action: string,
  held: ReadonlySet<string>,
  subtype: string | null,
): boolean {
  return grantsOf(action).some(
    (g) =>
      held.has(g.relation) &&
      (g.eventTypes.length === 0 || (subtype !== null && g.eventTypes.includes(subtype))),
  )
}

/** Every per-row action of the type, answered for one reader on one row. */
export function allowedBy<T extends ObjectTypeCode>(
  type: T,
  held: ReadonlySet<string>,
  subtype: string | null,
): Record<PerRowAction<T>, boolean> {
  return Object.fromEntries(
    PER_ROW_ACTIONS[type].map((a) => [a, grantAllows(a, held, subtype)]),
  ) as Record<PerRowAction<T>, boolean>
}
