/**
 * Every table the model names must exist in this schema.
 *
 * `FIXTURE_TABLE` maps the model's names to this database's, and an object type
 * declares which table it acts on. Both are authored, and a wrong entry is not a
 * type error — it is a query against a table that does not exist, at runtime, on
 * the one code path that uses it.
 *
 * That is not hypothetical. `ORG` named `organizations` after the organization
 * plugin was removed and its table dropped, so every write to an organisation
 * answered 500 and only a test caught it. This is cheaper than a test.
 */
import { getTableColumns, getTableName } from "drizzle-orm"
import type { SQLiteTable } from "drizzle-orm/sqlite-core"
import * as schema from "../src/db/schema"
import { FIXTURE_TABLE, OBJECT_TYPE, RELATION } from "../src/domain/vocabularies"

const TABLES = new Set<string>()
for (const value of Object.values(schema)) {
  if (!value || typeof value !== "object") continue
  try {
    if (Object.keys(getTableColumns(value as SQLiteTable)).length) {
      TABLES.add(getTableName(value as SQLiteTable))
    }
  } catch {
    // Not a table — a relations() definition or a zod schema.
  }
}

const problems: string[] = []

for (const [fixture, table] of Object.entries(FIXTURE_TABLE)) {
  if (!TABLES.has(table)) problems.push(`FIXTURE_TABLE maps '${fixture}' to '${table}', which does not exist`)
}

for (const t of OBJECT_TYPE) {
  if (!t.tableName) continue
  const mapped = FIXTURE_TABLE[t.tableName]
  if (!mapped) problems.push(`object type ${t.code} names '${t.tableName}', which FIXTURE_TABLE does not map`)
  else if (!TABLES.has(mapped)) problems.push(`object type ${t.code} resolves to '${mapped}', which does not exist`)
}

for (const r of RELATION) {
  for (const name of [r.sourceTable, r.throughTable]) {
    if (!name) continue
    const mapped = FIXTURE_TABLE[name]
    if (!mapped) problems.push(`relation ${r.code} derives from '${name}', which FIXTURE_TABLE does not map`)
    else if (!TABLES.has(mapped)) problems.push(`relation ${r.code} derives from '${mapped}', which does not exist`)
  }
}

if (problems.length) {
  console.error(`check-tables: ${problems.length} problem(s):\n` + problems.map((p) => `  ${p}`).join("\n"))
  process.exit(1)
}
console.log(`check-tables: every table the model names exists (${TABLES.size} tables)`)
