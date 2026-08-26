/**
 * Does this user hold this relation to this object?
 *
 * The PO's model answers authorisation with relations, not roles: you may edit
 * this team because you coach it, not because you are a coach. `relations.jsonl`
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
import { RELATION, ROLE_CODES } from "../domain/vocabularies"
import type { Db } from "./base"

type RelationRow = (typeof RELATION)[number]

/**
 * The PO's table names are plural snake_case; ours are singular camelCase.
 *
 * Both sides are generated from the same fixtures, so the rule is mechanical
 * rather than a mapping to maintain — `team_coaches` is `teamCoach`. Only the
 * irregulars need saying.
 */
const IRREGULAR: Record<string, string> = { people: "person" }

function tableFor(fixtureTable: string): string {
  const camel = fixtureTable.replace(/_(\w)/g, (_, c: string) => c.toUpperCase())
  if (IRREGULAR[camel]) return IRREGULAR[camel]!
  return camel.endsWith("ies")
    ? `${camel.slice(0, -3)}y`
    : /(?:ch|sh|ss|us|x|z)es$/.test(camel)
      ? camel.slice(0, -2)
      : camel.endsWith("s")
        ? camel.slice(0, -1)
        : camel
}

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
    // The fixtures say COACH; Better Auth's user.role holds coach, because
    // scripts/seed-sql.ts lowercases on the way in. Compare in one form or
    // ANY_COACH matches nobody — and it fails closed, so it would surface as
    // unexplained 403s rather than as a hole.
    return (user.role ?? "").toLowerCase() === r.roleCode!.toLowerCase()
  }
  if (!objectId) return false
  return holdsTableRelation(db, r, user.id, objectId)
}

/**
 * Every relation is executable against the schema that ships — asserted, not
 * assumed.
 *
 * A relation added upstream naming a table or column this database does not have
 * would grant nothing, silently, and every permission row referencing it would
 * be quietly unenforceable. Run by `mise run check`.
 */
export function unresolvedRelations(tables: Record<string, Record<string, unknown>>): string[] {
  const roles = new Set(ROLE_CODES.map((r) => r.toLowerCase()))
  return RELATION.flatMap((r) => {
    if (r.via === "everyone") return []
    if (r.via === "role") {
      return roles.has((r.roleCode ?? "").toLowerCase()) ? [] : [`${r.code}: no role ${r.roleCode}`]
    }
    const problems: string[] = []
    const check = (fixtureTable: string, col: string) => {
      const t = tableFor(fixtureTable)
      const cols = tables[t]
      if (!cols) return problems.push(`${r.code}: no table ${t} (${fixtureTable})`)
      const c = column(fixtureTable, col)
      if (!(c in cols)) problems.push(`${r.code}: ${t} has no column ${c}`)
    }
    check(r.sourceTable!, r.objectColumn!)
    if (r.throughTable) check(r.throughTable, r.userColumn!)
    else check(r.sourceTable!, r.userColumn!)
    if (r.filterColumn) check(r.sourceTable!, r.filterColumn)
    if (r.activeToColumn) check(r.sourceTable!, r.activeToColumn)
    return problems
  })
}
