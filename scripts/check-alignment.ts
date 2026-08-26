/**
 * Every table and column the PO's model names must exist in this schema.
 *
 * The model is not documentation any more — the relation derivations in
 * relations.jsonl are compiled and executed, so a table or column named there
 * that this database spells differently is not a discrepancy in a document, it
 * is a query that silently matches nothing. Relations fail closed, so the
 * symptom is an unexplained 403 rather than an error.
 *
 * This is what found the last one: `events.organizer_user_id` in the fixtures
 * against `event.created_by` here, which migration 0016 renamed rather than
 * papering over with an alias table.
 *
 * Run by `mise run check`.
 */
import { getTableColumns, getTableName } from "drizzle-orm"
import type { SQLiteTable } from "drizzle-orm/sqlite-core"
import * as schema from "../src/db/schema"
import { RELATION, ROLE_CODES } from "../src/domain/vocabularies"

/** Every table this database actually has, by its SQL name, with its columns. */
const TABLES: Record<string, Set<string>> = {}
for (const value of Object.values(schema)) {
  if (!value || typeof value !== "object") continue
  try {
    const cols = getTableColumns(value as SQLiteTable)
    if (!cols || !Object.keys(cols).length) continue
    TABLES[getTableName(value as SQLiteTable)] = new Set(
      Object.values(cols).map((c) => c.name),
    )
  } catch {
    // Not a table (a relations() definition, a zod schema) — skip.
  }
}

/**
 * The PO names tables in plural snake_case; this schema uses singular camelCase.
 *
 * Mechanical, because both sides are generated from the same fixtures by the
 * same rule — kept in step with `singularOf` in domain-generate.ts.
 */
function tableFor(fixtureTable: string): string {
  const camel = fixtureTable.replace(/_(\w)/g, (_, c: string) => c.toUpperCase())
  return camel.endsWith("ies")
    ? `${camel.slice(0, -3)}y`
    : /(?:ch|sh|ss|us|x|z)es$/.test(camel)
      ? camel.slice(0, -2)
      : camel.endsWith("s")
        ? camel.slice(0, -1)
        : camel
}

const problems: string[] = []
const roles = new Set(ROLE_CODES.map((r) => r.toLowerCase()))

const need = (relation: string, fixtureTable: string, col: string) => {
  const t = tableFor(fixtureTable)
  const cols = TABLES[t]
  if (!cols) return problems.push(`${relation}: no table '${t}' for fixture '${fixtureTable}'`)
  if (!cols.has(col)) {
    problems.push(`${relation}: '${t}' has no column '${col}' (fixture says ${fixtureTable}.${col})`)
  }
}

for (const r of RELATION) {
  if (r.via === "everyone") continue
  if (r.via === "role") {
    if (!roles.has((r.roleCode ?? "").toLowerCase())) {
      problems.push(`${r.code}: names role '${r.roleCode}', which is not in roles.jsonl`)
    }
    continue
  }
  if (r.via !== "table") {
    problems.push(`${r.code}: unknown derivation shape '${r.via}' — add a resolver for it`)
    continue
  }
  need(r.code, r.sourceTable!, r.objectColumn!)
  if (r.throughTable) {
    need(r.code, r.sourceTable!, r.throughColumn!)
    need(r.code, r.throughTable, r.userColumn!)
  } else {
    need(r.code, r.sourceTable!, r.userColumn!)
  }
  if (r.filterColumn) need(r.code, r.sourceTable!, r.filterColumn)
  if (r.activeToColumn) need(r.code, r.sourceTable!, r.activeToColumn)
}

if (problems.length) {
  console.error(
    `check-alignment: ${problems.length} mismatch(es) between remy-sport-biz and this schema:\n` +
      problems.map((p) => `  ${p}`).join("\n") +
      `\n\nFix the schema, not the model: an alias layer is a place for the two to` +
      `\ndrift apart quietly. If the PO's name is wrong, change it upstream.`,
  )
  process.exit(1)
}

console.log(
  `check-alignment: ${RELATION.length} relations resolve against ${Object.keys(TABLES).length} tables`,
)
