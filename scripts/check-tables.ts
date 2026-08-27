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
import { ACTION, FIXTURE_TABLE, GRANTS, OBJECT_TYPE, RELATION } from "../src/domain/vocabularies"

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

/**
 * A grant must be answerable: the relation has to be about the object the action
 * acts on.
 *
 * `can()` resolves a relation against the action's object id. If the two
 * disagree — an EVENT action granted to a TEAM relation — the lookup becomes
 * `team_coaches.team_id = <an event id>`, matches nothing, and denies everyone.
 * It fails *closed*, so it does not throw, does not log, and looks exactly like
 * a deliberate policy. Nothing surfaced it three separate times:
 *
 *   ENTER_SCORES              EVENT, granted to referee relations   (fixed: GAME)
 *   REGISTER_TEAM_FOR_EVENT   EVENT, granted to coach relations     (fixed: TEAM)
 *   REGISTER_PLAYER_FOR_EVENT EVENT, granted to player relations    (fixed: PLAYER)
 *
 * PLATFORM relations are exempt: a role comparison and `PUBLIC` need no object,
 * so they apply to an action of any type.
 */
/**
 * Grants that are known to be unresolvable, and are waiting on the Product
 * Owner rather than on a fix here.
 *
 * Both want "a coach of the team this player is on", which the model cannot say:
 * it is PLAYER -> player_teams -> team_coaches, an object-side hop two joins
 * deep, and the derivation shapes reach one. Answering it needs either a new
 * relation kind or a view.
 *
 * Listed pair by pair on purpose. A blanket exemption for either action would
 * hide the next mismatch in it, which is the failure this whole check exists to
 * stop.
 */
const KNOWN_UNRESOLVABLE = new Set([
  "EDIT_PLAYER_PROFILE/HEAD_COACH",
  "EDIT_PLAYER_PROFILE/ASSISTANT_COACH",
  "RECORD_ATTENDANCE/HEAD_COACH",
  "RECORD_ATTENDANCE/ASSISTANT_COACH",
])

for (const [action, grants] of Object.entries(GRANTS)) {
  const a = ACTION.find((x) => x.code === action)
  if (!a || a.objectTypeCode === "PLATFORM") continue

  for (const g of grants as ReadonlyArray<{ relation: string }>) {
    const r = RELATION.find((x) => x.code === g.relation)
    if (!r) {
      problems.push(`action ${action} is granted to '${g.relation}', which is not a relation`)
      continue
    }
    if (r.objectTypeCode === "PLATFORM") continue
    if (KNOWN_UNRESOLVABLE.has(`${action}/${g.relation}`)) continue
    if (r.objectTypeCode !== a.objectTypeCode) {
      problems.push(
        `action ${action} acts on ${a.objectTypeCode} but is granted to ${g.relation}, ` +
          `which is about ${r.objectTypeCode} — that grant can never resolve`,
      )
    }
  }
}

if (problems.length) {
  console.error(`check-tables: ${problems.length} problem(s):\n` + problems.map((p) => `  ${p}`).join("\n"))
  process.exit(1)
}
console.log(
  `check-tables: every table the model names exists (${TABLES.size} tables), ` +
    `and every grant resolves (${KNOWN_UNRESOLVABLE.size} known exceptions)`,
)
