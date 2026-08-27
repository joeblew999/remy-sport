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
import { ACTION, FIXTURE_TABLE, OBJECT_TYPE, RELATION, STORED_ROLE } from "../domain/vocabularies"
import type { Db } from "./base"

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
  return holdsTableRelation(db, r, user.id, objectId)
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

/** Does a row with this id exist in that table? A missing object is a 404, not a 403. */
export async function objectExists(db: Db, table: string, id: string): Promise<boolean> {
  const row = await db.get(
    sql`SELECT 1 AS ok FROM ${sql.identifier(table)} WHERE ${sql.identifier("id")} = ${id} LIMIT 1`,
  )
  return row !== undefined && row !== null
}
