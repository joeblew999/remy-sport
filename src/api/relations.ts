/**
 * Does this user hold this relation to this object?
 *
 * The PO's model answers authorisation with relations, not roles: you may edit
 * this team because you coach it, not because you are a coach. the model's `RELATION`
 * lists the nineteen, and each now carries its derivation as **structured
 * columns** rather than prose, so this file executes them instead of restating
 * them. There is one query builder here, not nineteen resolvers.
 *
 * Three shapes cover all nineteen:
 *
 *   via=table     a row in `sourceTable` links user to object — optionally
 *                 narrowed by a filter, reached through a second hop, or bounded
 *                 by an end date
 *   via=role      the user's platform role is `roleCode`
 *   via=everyone  no condition
 *
 * Derived, never stored. A Zanzibar engine would copy these tuples into its own
 * store and re-sync on every data change, which is a drift surface; reading the
 * rows that already exist has none, and there is no service to run.
 *
 * The whole seam with Better Auth is two fields: `user.id` joins every
 * table-shaped relation, `user.role` *is* every role-shaped one. That join is a
 * single column because migration 0015 gave the seeded users their fixture ids.
 */

import { sql } from "drizzle-orm"
import { ACTION, FIXTURE_TABLE, GRANTS, OBJECT_TYPE, RELATION, STORED_ROLE } from "../domain/vocabularies"
// From ./db, not ./base: base imports this module, and importing back — even
// as a type — is the cycle check:deps now refuses.
import type { Db } from "./db"

type RelationRow = (typeof RELATION)[number]

/**
 * The table a fixture's rows live in.
 *
 * Generated — see FIXTURE_TABLE in domain/vocabularies.ts. This used to
 * re-derive the plural-snake to singular-camel rule locally, as did the
 * alignment check and the generator, and two of those three silently matched
 * nothing when a caller had the case the other way round.
 */
const tableFor = (fixtureTable: string): string => FIXTURE_TABLE[fixtureTable] ?? fixtureTable

/**
 * No column aliasing, deliberately.
 *
 * Migration 0016 renamed the last column whose name disagreed with the fixtures
 * (`event.created_by` -> `organizer_user_id`), so a derivation compiles straight
 * through. If a table ever needs an alias again, fix the schema instead — an
 * alias map is a place for the two models to drift apart quietly.
 */
const column = (_table: string, col: string) => col

/**
 * Build the existence check for one relation.
 *
 * Assembled with drizzle's `sql` template rather than the query builder, because
 * the table and column names arrive as strings from the fixtures while the
 * builder wants them as compile-time properties. `sql.identifier` quotes them,
 * and the two values that vary per request — `userId`, `objectId` — are bound
 * parameters, never interpolated.
 */
async function holdsTableRelation(
  db: Db,
  r: RelationRow,
  userId: string,
  objectId: string,
): Promise<boolean> {
  const src = sql.identifier(tableFor(r.sourceTable!))
  const objCol = sql.identifier(column(r.sourceTable!, r.objectColumn!))
  const userCol = sql.identifier(column(r.sourceTable!, r.userColumn!))

  const conditions = [sql`${src}.${objCol} = ${objectId}`]

  let from = sql`${src}`
  if (r.throughTable) {
    // The link table does not carry the user — hop through the entity that does,
    // e.g. player_teams -> players.user_id.
    const through = sql.identifier(tableFor(r.throughTable))
    const fk = sql.identifier(r.throughColumn!)
    from = sql`${src} JOIN ${through} ON ${through}.${sql.identifier("id")} = ${src}.${fk}`
    conditions.push(sql`${through}.${userCol} = ${userId}`)
  } else {
    conditions.push(sql`${src}.${userCol} = ${userId}`)
  }

  if (r.filterColumn) {
    conditions.push(sql`${src}.${sql.identifier(r.filterColumn)} = ${r.filterValue}`)
  }

  if (r.activeToColumn) {
    // Historic spells must not still grant the relation: empty means current.
    const to = sql.identifier(r.activeToColumn)
    const today = new Date().toISOString().slice(0, 10)
    conditions.push(sql`(${src}.${to} IS NULL OR ${src}.${to} >= ${today})`)
  }

  const row = await db.get(
    sql`SELECT 1 AS ok FROM ${from} WHERE ${sql.join(conditions, sql` AND `)} LIMIT 1`,
  )
  return row !== undefined && row !== null
}

/**
 * `IN (?, ?, ?)`, with every value a bound parameter.
 *
 * Not `sql`IN ${ids}``: drizzle binds an array as a single parameter, so that
 * form compiles, runs, matches nothing and fails closed — a permission bug that
 * looks like a data problem. Written out so the expansion is visible.
 */
const inList = (ids: readonly string[]) =>
  sql`IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`

/**
 * How many ids may go into one `IN` list.
 *
 * SQLite counts every bound parameter against a per-statement limit, and D1
 * enforces it: asking about a few hundred objects at once fails with "too many
 * SQL variables" rather than returning a wrong answer. Found by the equivalence
 * test on the first run, over the full seeded player list.
 *
 * The set-wise reads are still per relation rather than per object — a list of
 * 28 games is one query, as intended. This only splits the pathological case,
 * and 90 leaves room for the other bindings a statement carries.
 */
export const MAX_IN = 90

const chunked = <T>(xs: readonly T[]): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += MAX_IN) out.push(xs.slice(i, i + MAX_IN))
  return out
}

/** Run a set-wise read in id-sized batches and union the results. */
export async function inBatches<T>(
  ids: readonly string[],
  read: (batch: string[]) => Promise<T[]>,
): Promise<T[]> {
  const batches = chunked(ids)
  if (batches.length === 1) return read(batches[0]!)
  return (await Promise.all(batches.map(read))).flat()
}

/**
 * Which of these objects does the user hold this relation on?
 *
 * The set-wise form of `holds`, and the reason `/api/games` went from 246ms to
 * single figures. `holds` asks about one object and costs one or two queries;
 * asking it in a loop is what a list endpoint was doing, so a schedule of 28
 * games cost around 700 reads for four permissions.
 *
 * Cost here is per *relation*, not per object: one query for a table relation,
 * two for a parent one, whether the caller passes three ids or three hundred.
 *
 * Bounded by `objectIds` on purpose, rather than returning everything the user
 * holds and intersecting afterwards. A co-organiser of a long league holds the
 * relation on thousands of games; a page showing thirty should not read them
 * all to answer for thirty.
 */
export async function heldAmong(
  db: Db,
  relationCode: string,
  user: { id: string; role?: string | null },
  objectIds: readonly string[],
): Promise<Set<string>> {
  const r = RELATION.find((x) => x.code === relationCode)
  if (!r || objectIds.length === 0) return new Set()

  // No object condition to apply: the relation is true for all of them or none.
  if (r.via === "everyone") return new Set(objectIds)
  if (r.via === "role") {
    return user.role === STORED_ROLE[r.roleCode as keyof typeof STORED_ROLE]
      ? new Set(objectIds)
      : new Set()
  }

  /**
   * Inherited from the parent, in two queries instead of two per object.
   *
   * `holds` reads one row's parent and recurses. Here the whole parent map is
   * read at once, the parent relation is answered set-wise over the distinct
   * parents, and the children are mapped back — so a schedule resolves
   * `GAME_EVENT_CO_ORGANIZER` for every game with one read of `games` and one
   * of `event_co_organizers`, however many games there are.
   *
   * Depth is bounded by the model, as it is for `holds`: nothing declares a
   * parent relation whose own parent relation is another one.
   */
  if (r.via === "parent") {
    const src = sql.identifier(tableFor(r.sourceTable!))
    const idCol = sql.identifier(r.objectColumn!)
    const fk = sql.identifier(r.throughColumn!)
    const rows = await inBatches(objectIds, (batch) =>
      db.all<{ id: string; parent: string | null }>(
        sql`SELECT ${src}.${idCol} AS "id", ${src}.${fk} AS "parent"
            FROM ${src} WHERE ${src}.${idCol} ${inList(batch)}`,
      ),
    )
    const parents = [...new Set(rows.map((row) => row.parent).filter((p): p is string => !!p))]
    if (parents.length === 0) return new Set()

    const heldParents = await heldAmong(db, r.parentRelation!, user, parents)
    return new Set(rows.filter((row) => row.parent && heldParents.has(row.parent)).map((row) => row.id))
  }

  if (r.via !== "table" || !r.sourceTable || !r.userColumn || !r.objectColumn) return new Set()

  // The same SQL `holdsTableRelation` builds, with `= ?` widened to `IN` and the
  // object column selected rather than discarded.
  const src = sql.identifier(tableFor(r.sourceTable))
  const objCol = sql.identifier(column(r.sourceTable, r.objectColumn))
  const userCol = sql.identifier(column(r.sourceTable, r.userColumn))

  let from = sql`${src}`
  const extra: ReturnType<typeof sql>[] = []

  if (r.throughTable) {
    const through = sql.identifier(tableFor(r.throughTable))
    const fk = sql.identifier(r.throughColumn!)
    from = sql`${src} JOIN ${through} ON ${through}.${sql.identifier("id")} = ${src}.${fk}`
    extra.push(sql`${through}.${userCol} = ${user.id}`)
  } else {
    extra.push(sql`${src}.${userCol} = ${user.id}`)
  }

  if (r.filterColumn) {
    extra.push(sql`${src}.${sql.identifier(r.filterColumn)} = ${r.filterValue}`)
  }
  if (r.activeToColumn) {
    // Historic spells must not still grant the relation: empty means current.
    const to = sql.identifier(r.activeToColumn)
    const today = new Date().toISOString().slice(0, 10)
    extra.push(sql`(${src}.${to} IS NULL OR ${src}.${to} >= ${today})`)
  }

  const rows = await inBatches(objectIds, (batch) =>
    db.all<{ objectId: string }>(
      sql`SELECT DISTINCT ${src}.${objCol} AS "objectId"
          FROM ${from}
          WHERE ${sql.join([sql`${src}.${objCol} ${inList(batch)}`, ...extra], sql` AND `)}`,
    ),
  )
  return new Set(rows.map((row) => row.objectId))
}

/**
 * The events these objects belong to, for the grants that narrow by subtype.
 *
 * `eventIdFor` one row at a time, in a single read. For an EVENT action the
 * object is its own event and no query happens at all.
 */
export async function eventIdsFor(
  db: Db,
  action: string,
  objectIds: readonly string[],
): Promise<Map<string, string | null>> {
  const a = ACTION.find((x) => x.code === action)
  const type = OBJECT_TYPE.find((t) => t.code === a?.objectTypeCode)
  const empty = new Map(objectIds.map((id) => [id, null as string | null]))
  if (!type) return empty
  if (type.code === "EVENT") return new Map(objectIds.map((id) => [id, id]))
  if (type.parentTypeCode !== "EVENT" || !type.tableName || objectIds.length === 0) return empty

  const src = sql.identifier(tableFor(type.tableName))
  const fk = sql.identifier(type.parentColumn!)
  const rows = await inBatches(objectIds, (batch) =>
    db.all<{ id: string; parent: string | null }>(
      sql`SELECT ${src}.${sql.identifier("id")} AS "id", ${src}.${fk} AS "parent"
          FROM ${src} WHERE ${src}.${sql.identifier("id")} ${inList(batch)}`,
    ),
  )
  const found = new Map(rows.map((row) => [row.id, row.parent]))
  return new Map(objectIds.map((id) => [id, found.get(id) ?? null]))
}

/**
 * The subtype of each of these events, in one read.
 *
 * The narrowing grants ask "is this a CAMP" — `eventTypes: ["CAMP", "SHOWCASE"]`
 * on `REGISTER_PLAYER_FOR_EVENT`, for one. Resolved once for a whole list.
 */
export async function eventTypesOf(
  db: Db,
  eventIds: readonly string[],
): Promise<Map<string, string>> {
  if (eventIds.length === 0) return new Map()
  const events = sql.identifier(tableFor("events"))
  const rows = await inBatches(eventIds, (batch) =>
    db.all<{ id: string; typeCode: string }>(
      sql`SELECT ${events}.${sql.identifier("id")} AS "id",
                 ${events}.${sql.identifier("type_code")} AS "typeCode"
          FROM ${events} WHERE ${events}.${sql.identifier("id")} ${inList(batch)}`,
    ),
  )
  return new Map(rows.map((row) => [row.id, row.typeCode]))
}

/**
 * The inverse: everyone who holds this relation on this object.
 *
 * `holds` asks "is this one person a coach of that team". This asks "who are
 * that team's coaches", which is the question a notification has to answer —
 * and answering it by reading a table directly is how the first version of Web
 * Push ended up notifying only followers. `RECEIVE_TEAM_NOTIFICATIONS` is
 * granted to HEAD_COACH, ASSISTANT_COACH, TEAM_MANAGER and TEAM_PLAYER as well
 * as FOLLOWER_TEAM, so a team's own coach got nothing until they pressed a
 * Follow button — the model had said otherwise all along.
 *
 * Same SQL as `holdsTableRelation`, with the user condition removed and the
 * user column selected instead. Only `via: "table"` relations can answer: a
 * platform relation like ANY_SIGNED_IN has no bounded set of people, and
 * treating it as an audience would mean notifying the entire platform.
 */
export async function usersHolding(
  db: Db,
  relationCode: string,
  objectId: string,
): Promise<string[]> {
  const r = RELATION.find((x) => x.code === relationCode)
  if (!r || r.via !== "table" || !r.sourceTable) return []

  const src = sql.identifier(tableFor(r.sourceTable))
  const objCol = sql.identifier(column(r.sourceTable, r.objectColumn!))
  const userCol = sql.identifier(column(r.sourceTable, r.userColumn!))

  const conditions = [sql`${src}.${objCol} = ${objectId}`]
  let from = sql`${src}`
  let selected = sql`${src}.${userCol}`

  if (r.throughTable) {
    const through = sql.identifier(tableFor(r.throughTable))
    const fk = sql.identifier(r.throughColumn!)
    from = sql`${src} JOIN ${through} ON ${through}.${sql.identifier("id")} = ${src}.${fk}`
    selected = sql`${through}.${userCol}`
  }

  if (r.filterColumn) {
    conditions.push(sql`${src}.${sql.identifier(r.filterColumn)} = ${r.filterValue}`)
  }
  if (r.activeToColumn) {
    const to = sql.identifier(r.activeToColumn)
    const today = new Date().toISOString().slice(0, 10)
    conditions.push(sql`(${src}.${to} IS NULL OR ${src}.${to} >= ${today})`)
  }
  // A player row can have a null user: somebody on a team sheet who has never
  // signed in. They are a real player and not a recipient.
  conditions.push(sql`${selected} IS NOT NULL`)

  const rows = await db.all<{ userId: string }>(
    sql`SELECT DISTINCT ${selected} AS "userId" FROM ${from} WHERE ${sql.join(conditions, sql` AND `)}`,
  )
  return rows.map((row) => row.userId)
}

/**
 * The other way round: which objects does *this user* hold `relationCode` on?
 *
 * `holds` answers it for one object and `usersHolding` inverts it for one
 * relation; this is the third face of the same query and the one every "yours"
 * list in the GUI actually wants. Without it a page asking "which players am I
 * guardian to" had to fetch every player and ask `can` about each — a table
 * scan and N round trips to answer a question SQL can answer in one.
 *
 * The same builder as `usersHolding`, with the two conditions swapped: filter
 * on the user column, select the object column. Sharing the shape matters more
 * than the six lines it saves — a relation's `throughTable`, `filterColumn` and
 * `activeToColumn` have to be interpreted identically in all three, or the
 * model means different things depending on which direction you ask from.
 *
 * Empty for a platform relation, which has no object to return.
 */
export async function objectsHeldBy(
  db: Db,
  relationCode: string,
  userId: string,
): Promise<string[]> {
  const r = RELATION.find((x) => x.code === relationCode)
  if (!r || r.via !== "table" || !r.sourceTable || !r.userColumn || !r.objectColumn) return []

  const src = sql.identifier(tableFor(r.sourceTable))
  const objCol = sql.identifier(column(r.sourceTable, r.objectColumn))
  const userCol = sql.identifier(column(r.sourceTable, r.userColumn))

  let from = sql`${src}`
  let userSide = sql`${src}.${userCol}`
  const selected = sql`${src}.${objCol}`

  if (r.throughTable) {
    const through = sql.identifier(tableFor(r.throughTable))
    const fk = sql.identifier(r.throughColumn!)
    from = sql`${src} JOIN ${through} ON ${through}.${sql.identifier("id")} = ${src}.${fk}`
    userSide = sql`${through}.${userCol}`
  }

  const conditions = [sql`${userSide} = ${userId}`]
  if (r.filterColumn) {
    conditions.push(sql`${src}.${sql.identifier(r.filterColumn)} = ${r.filterValue}`)
  }
  if (r.activeToColumn) {
    const to = sql.identifier(r.activeToColumn)
    const today = new Date().toISOString().slice(0, 10)
    conditions.push(sql`(${src}.${to} IS NULL OR ${src}.${to} >= ${today})`)
  }

  const rows = await db.all<{ objectId: string }>(
    sql`SELECT DISTINCT ${selected} AS "objectId" FROM ${from} WHERE ${sql.join(conditions, sql` AND `)}`,
  )
  return rows.map((row) => row.objectId)
}

/**
 * Everyone the model says may receive `action` about `objectId`.
 *
 * The union of the people holding any relation the action is granted to. This is
 * what makes "who should hear about this" a question the Product Owner answers
 * in remy-sport-biz rather than a table read in the notification code.
 */
export async function audienceFor(
  db: Db,
  action: string,
  objectId: string,
): Promise<string[]> {
  const grants = (GRANTS as Record<string, ReadonlyArray<{ relation: string }>>)[action]
  if (!grants?.length) return []
  const found = await Promise.all(grants.map((g) => usersHolding(db, g.relation, objectId)))
  return [...new Set(found.flat())]
}

/** Does this user hold this relation? `objectId` is ignored for platform relations. */
export async function holds(
  db: Db,
  relationCode: string,
  user: { id: string; role?: string | null },
  objectId: string | null,
): Promise<boolean> {
  const r = RELATION.find((x) => x.code === relationCode)
  if (!r) return false

  if (r.via === "everyone") return true
  if (r.via === "role") {
    // STORED_ROLE is the code as the database holds it. Comparing the two forms
    // by hand is what this replaced: it fails closed, so getting it wrong
    // matches nobody and surfaces as unexplained 403s rather than as an error.
    return user.role === STORED_ROLE[r.roleCode as keyof typeof STORED_ROLE]
  }
  if (!objectId) return false

  /**
   * Inherited from the object's parent: whoever runs the event runs its games.
   *
   * Read the parent's id off the child row, then ask the *named* relation about
   * the parent — so `GAME_EVENT_CO_ORGANIZER` is `CO_ORGANIZER` on the game's
   * event, including its `status_code = ACCEPTED` filter, and stays correct if
   * that relation is ever redefined.
   *
   * The table shape cannot express this. Its one hop resolves the *user* side
   * (`player_teams` -> `players.user_id`); this hop is on the *object* side, and
   * for a co-organizer it is two joins deep — `games` -> `events` ->
   * `event_co_organizers`. Recursing costs one extra read and reuses a relation
   * already defined rather than restating its derivation against a new table.
   *
   * Depth is bounded by the model: a parent relation naming a parent relation
   * would recurse, and nothing in the model does. `GAME` is the only child
   * object type, and its parents are all `EVENT`.
   */
  if (r.via === "parent") {
    const src = sql.identifier(tableFor(r.sourceTable!))
    const idCol = sql.identifier(r.objectColumn!)
    const fk = sql.identifier(r.throughColumn!)
    const row = await db.get<{ parent: string | null }>(
      sql`SELECT ${src}.${fk} AS parent FROM ${src} WHERE ${src}.${idCol} = ${objectId} LIMIT 1`,
    )
    if (!row?.parent) return false
    return holds(db, r.parentRelation!, user, row.parent)
  }

  return holdsTableRelation(db, r, user.id, objectId)
}


/**
 * The event an action's object belongs to, for the grants that narrow by
 * subtype — "a camp has no brackets to generate".
 *
 * For an EVENT action the object *is* the event. For a GAME action it is one
 * hop up, and the model says which: `GAME` declares `parentTypeCode: "EVENT"`
 * and `parentColumn: "event_id"`.
 *
 * Written because the caller used to assume the two were the same and looked up
 * `event.id = objectId` unconditionally. Against a game id that matched no row,
 * so the subtype resolved to null, so every grant carrying `eventTypes` was
 * skipped — and `ENTER_SCORES` silently denied everyone, referees and organisers
 * alike. It failed closed, which is the safe direction and the hard one to spot.
 */
export async function eventIdFor(
  db: Db,
  action: string,
  objectId: string,
): Promise<string | null> {
  const a = ACTION.find((x) => x.code === action)
  const type = OBJECT_TYPE.find((t) => t.code === a?.objectTypeCode)
  if (!type) return null
  if (type.code === "EVENT") return objectId
  if (type.parentTypeCode !== "EVENT" || !type.tableName) return null

  const src = sql.identifier(tableFor(type.tableName))
  const fk = sql.identifier(type.parentColumn!)
  const row = await db.get<{ parent: string | null }>(
    sql`SELECT ${src}.${fk} AS parent FROM ${src} WHERE ${src}.${sql.identifier("id")} = ${objectId} LIMIT 1`,
  )
  return row?.parent ?? null
}

/**
 * The table an action's object lives in, or null when it has none.
 *
 * `EDIT_TEAM_PROFILE` declares `object_type_code: TEAM` and `TEAM` declares
 * `table_name: teams`, so the action already says what it acts on. Passing an
 * object resolver at every call site restated that, and a restatement is a place
 * to disagree — `requireAction("EDIT_TEAM_PROFILE", existingEvent)` would have
 * type-checked and quietly authorised against the wrong row.
 *
 * `CREATE_TEAM` is a PLATFORM action: the team does not exist yet, so there is
 * nothing to be in a relation to, and this returns null.
 */
export function objectTableFor(action: string): string | null {
  const a = ACTION.find((x) => x.code === action)
  if (!a) return null
  const type = OBJECT_TYPE.find((t) => t.code === a.objectTypeCode)
  return type?.tableName ? tableFor(type.tableName) : null
}

/**
 * The table an OBJECT_TYPE's rows live in — the same lookup as above, asked
 * directly rather than by way of an action.
 *
 * `subscription.object_id` is a polymorphic reference: it points at six
 * different tables, so it cannot carry a foreign key, and this is what stands
 * in for one when someone follows something. PLATFORM has no table and returns
 * null, which is the honest answer — you cannot follow the platform.
 */
export function tableForObjectType(objectTypeCode: string): string | null {
  const type = OBJECT_TYPE.find((t) => t.code === objectTypeCode)
  return type?.tableName ? tableFor(type.tableName) : null
}

/** Does a row with this id exist in that table? A missing object is a 404, not a 403. */
export async function objectExists(db: Db, table: string, id: string): Promise<boolean> {
  const row = await db.get(
    sql`SELECT 1 AS ok FROM ${sql.identifier(table)} WHERE ${sql.identifier("id")} = ${id} LIMIT 1`,
  )
  return row !== undefined && row !== null
}
