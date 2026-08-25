/**
 * Generate the controlled vocabularies from the Product Owner's fixtures.
 *
 * Every reference table in remy-sport-biz becomes, with nothing written by hand
 * here or anywhere downstream:
 *
 *   src/db/vocabularies-schema.ts   drizzle tables
 *   src/domain/vocabularies.ts      typed constants + code unions
 *   src/db/migrations/0009_*.sql    DDL and rows
 *
 * From there the existing derivation carries it the rest of the way: drizzle-zod
 * builds the response schemas from the tables, the oRPC contract publishes those
 * schemas, and the SPA infers its types from the contract. So adding a
 * vocabulary upstream is a file in `reference/` plus `mise run domain:generate`.
 * There is no list of tables in this file to keep in step, and none downstream.
 *
 * LANGUAGES ARE ROWS UPSTREAM, ONE COLUMN HERE. The fixtures keep English as a
 * `*_en` pivot on the row and every other language as a translations.jsonl row,
 * which is right for a format that has to be diffed and validated by hand. A
 * database serving reads wants the opposite, so each `*_en` field is
 * materialised into a JSON column keyed by locale — `name_en` becomes `names`,
 * `description_en` becomes `descriptions`. Adding a language changes values in
 * cells; it is never an ALTER TABLE.
 *
 * Run: mise run domain:generate  /  mise run domain:check
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs"
import { dirname, resolve } from "path"

const BIZ = resolve(import.meta.dir, "../../remy-sport-biz/data/seed")
const OUT_TS = resolve(import.meta.dir, "../src/domain/vocabularies.ts")
const OUT_SCHEMA = resolve(import.meta.dir, "../src/db/vocabularies-schema.ts")
const MIGRATION = resolve(import.meta.dir, "../src/db/migrations/0009_reference_vocabularies.sql")
const OUT_SEED = resolve(import.meta.dir, "../src/db/seed-data.ts")
const OUT_FIXTURES = resolve(import.meta.dir, "../src/db/fixtures-schema.ts")
const MIGRATION_MODEL = resolve(import.meta.dir, "../src/db/migrations/0013_domain_model.sql")
const check = process.argv.includes("--check")

function fail(message: string): never {
  console.error(message)
  process.exit(2)
  throw new Error(message) // unreachable; keeps `never` honest without @types/node
}

const missing = (what: string): never =>
  fail(
    `domain-generate: ${what} not found under ${BIZ}.\n` +
      `  The vocabularies come from the remy-sport-biz repo, which AGENTS.md\n` +
      `  expects cloned at ../remy-sport-biz/. Clone it, or skip this task —\n` +
      `  the generated files are committed, so building does not need it.`,
  )

/**
 * Find a fixture by file name, wherever it sits under data/seed.
 *
 * The fixtures are grouped into reference/, entities/, relationships/,
 * authorization/ and localization/, and that grouping is upstream's to change —
 * it is how each file declares the way it is localized. Resolving by name means
 * a regrouping there cannot break this, which is exactly how it broke once.
 */
function findSeed(file: string): string {
  if (!existsSync(BIZ)) return missing(file)
  const stack = [BIZ]
  while (stack.length) {
    const dir = stack.pop()!
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) stack.push(resolve(dir, entry.name))
      else if (entry.name === file) return resolve(dir, entry.name)
    }
  }
  return missing(file)
}

type Json = Record<string, string | number | boolean | null>

const readJsonl = <T = Json>(path: string): T[] =>
  readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T)

/**
 * Every language the fixtures declare, in the fixtures' own order.
 *
 * Not sorted English-first, even though English is the pivot. `locales` is a
 * vocabulary like any other, so the database serves it ordered by the `sort`
 * column the PO controls by ordering the JSONL — and a constant here in a
 * different order than the endpoint returns is two orders for one list, which
 * is exactly the drift this file exists to prevent. English being the fallback
 * is stated once, in domain/names.ts, rather than implied by position.
 */
const LOCALES: string[] = readJsonl<{ code: string }>(findSeed("locales.jsonl")).map((l) => l.code)

/** Non-English strings, keyed `table|record|field|locale`. */
const TRANSLATIONS = new Map<string, string>(
  readJsonl<{
    table_name: string
    record_key: string
    field_name: string
    locale_code: string
    value: string
  }>(findSeed("translations.jsonl")).map((r) => [
    `${r.table_name}|${r.record_key}|${r.field_name}|${r.locale_code}`,
    r.value,
  ]),
)

// ── Naming ─────────────────────────────────────────────────────────────────
// The fixtures are plural (`age_groups.jsonl`); tables here are singular
// (`age_group`), which is what migrations 0005 and 0006 already established.

function singular(plural: string): string {
  // The -es rules matter: `team_coaches` is one table and `user_statuses` is
  // another, and naive `-s` stripping produces `team_coache` and
  // `user_statuse`. Only the endings English actually pluralises with -es.
  if (plural.endsWith("ies")) return `${plural.slice(0, -3)}y`
  if (/(?:ch|sh|ss|us|x|z)es$/.test(plural)) return plural.slice(0, -2)
  return plural.endsWith("s") ? plural.slice(0, -1) : plural
}

const camel = (snake: string) => snake.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
const pascal = (snake: string) => {
  const c = camel(snake)
  return c[0]!.toUpperCase() + c.slice(1)
}

// ── Reading a vocabulary ───────────────────────────────────────────────────

interface Column {
  name: string
  sql: "TEXT" | "INTEGER"
  notNull: boolean
  /** Set when this column holds locale-keyed JSON derived from a `*_en` field. */
  translates?: string
  /** Set when this column references another generated vocabulary. */
  references?: string
}

interface Vocab {
  file: string
  /** Fixture table name, e.g. `age_groups` — what translations.jsonl keys by. */
  source: string
  /** SQL table, e.g. `age_group`. */
  table: string
  columns: Column[]
  rows: Json[]
  /** Per row: field -> locale -> value, for every translatable field. */
  i18n: Record<string, Record<string, string>>[]
}

function readVocabularies(): Vocab[] {
  const dir = resolve(BIZ, "reference")
  if (!existsSync(dir)) missing("reference/")

  const vocabs = readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl"))
    .sort()
    .map((file): Vocab => {
      const source = file.replace(/\.jsonl$/, "")
      const rows = readJsonl(resolve(dir, file))
      if (!rows.length) fail(`domain-generate: ${file} has no rows`)

      const columns: Column[] = []
      const i18n: Record<string, Record<string, string>>[] = rows.map(() => ({}))

      for (const key of Object.keys(rows[0]!)) {
        const nullable = rows.some((r) => r[key] === null || r[key] === undefined)
        const sample = rows.find((r) => r[key] !== null && r[key] !== undefined)?.[key]
        columns.push({
          name: key,
          sql: typeof sample === "number" || typeof sample === "boolean" ? "INTEGER" : "TEXT",
          notNull: !nullable,
        })

        // A `*_en` pivot gains a JSON sibling holding every locale.
        if (!key.endsWith("_en")) continue
        const field = key.slice(0, -3)
        columns.push({ name: `${field}s`, sql: "TEXT", notNull: true, translates: field })
        rows.forEach((row, i) => {
          const code = String(row.code)
          const values: Record<string, string> = {}
          for (const locale of LOCALES) {
            const value =
              locale === "en"
                ? (row[key] as string)
                : TRANSLATIONS.get(`${source}|${code}|${field}|${locale}`)
            if (value === undefined) {
              fail(
                `domain-generate: no '${locale}' ${field} for ${source}.${code}.\n` +
                  `  Upstream guarantees a translation for every declared locale —\n` +
                  `  run 'mise run data:check' in remy-sport-biz to see what is missing.`,
              )
            }
            values[locale] = value
          }
          i18n[i]![field] = values
        })
      }

      // Positional ordering, so the PO controls dropdown order by ordering the
      // JSONL. Sorting by code gives OPEN, SENIOR, U10, U12…, which is useless.
      columns.push({ name: "sort", sql: "INTEGER", notNull: true })

      return {
        file,
        source,
        table: singular(source),
        columns,
        rows,
        i18n,
      }
    })

  // Resolve `*_code` columns against the other vocabularies so the DDL can
  // carry real foreign keys. `category_code` names no table called `category`,
  // so a suffix match finds `notification_category`; anything ambiguous or
  // unmatched is left a plain column rather than guessed at.
  const byTable = new Map(vocabs.map((v) => [v.table, v]))
  for (const v of vocabs) {
    for (const c of v.columns) {
      if (c.name === "code" || !c.name.endsWith("_code")) continue
      const want = singular(c.name.slice(0, -5))
      const suffix = vocabs.filter((o) => o.table.endsWith(`_${want}`))
      const target = byTable.get(want) ?? (suffix.length === 1 ? suffix[0] : undefined)
      if (target && target.table !== v.table) c.references = target.table
    }
  }

  // Order so a foreign key's target is created first.
  const ordered: Vocab[] = []
  const done = new Set<string>()
  const visit = (v: Vocab, chain: Set<string>) => {
    if (done.has(v.table) || chain.has(v.table)) return // a cycle keeps source order
    chain.add(v.table)
    for (const c of v.columns) if (c.references) visit(byTable.get(c.references)!, chain)
    chain.delete(v.table)
    done.add(v.table)
    ordered.push(v)
  }
  for (const v of vocabs) visit(v, new Set())
  return ordered
}

const VOCABULARIES = readVocabularies()

const json = (v: unknown) => JSON.stringify(v)

// ── Emit: TypeScript constants ─────────────────────────────────────────────

function emitConstants(v: Vocab): string {
  const name = v.table.toUpperCase()
  const entries = v.rows.map((row, i) => {
    const plain = v.columns
      .filter((c) => c.name !== "sort" && !c.translates && !c.name.endsWith("_en"))
      .map((c) => `${camel(c.name)}: ${json(c.name === "code" ? String(row.code) : row[c.name])}`)
    const localised = Object.entries(v.i18n[i]!).map(([f, byLocale]) => `${f}s: ${json(byLocale)}`)
    return `  { ${[...plain, ...localised].join(", ")} },`
  })
  const codes = v.rows.map((row) => String(row.code))
  return [
    `/** ${v.rows.length} rows, from ${v.file}. */`,
    `export const ${name} = [`,
    ...entries,
    `] as const`,
    ``,
    `export const ${name}_CODES = ${name}.map((t) => t.code) as unknown as [`,
    `  ${codes.map((c) => json(c)).join(",\n  ")},`,
    `]`,
    ``,
    `export type ${pascal(v.table)}Code = (typeof ${name}_CODES)[number]`,
    ``,
  ].join("\n")
}

// ── Emit: drizzle schema ───────────────────────────────────────────────────

function emitDrizzle(v: Vocab): string {
  const fields = v.columns.map((c) => {
    if (c.translates) {
      return `  ${camel(c.name)}: text(${json(c.name)}, { mode: "json" }).$type<Names>().notNull(),`
    }
    const parts = [c.sql === "INTEGER" ? `integer(${json(c.name)})` : `text(${json(c.name)})`]
    if (c.name === "code") parts.push("primaryKey()")
    else if (c.notNull) parts.push("notNull()")
    if (c.references) parts.push(`references(() => ${camel(c.references)}.code)`)
    return `  ${camel(c.name)}: ${parts.join(".")},`
  })
  return [`export const ${camel(v.table)} = sqliteTable(${json(v.table)}, {`, ...fields, `})`, ``].join("\n")
}

// ── Emit: SQL ──────────────────────────────────────────────────────────────

const sql = (s: string) => `'${s.replace(/'/g, "''")}'`

function emitSql(v: Vocab): string {
  const ddl = v.columns.map((c) => {
    const parts = [`  ${c.name.padEnd(18)} ${c.sql}`]
    if (c.name === "code") parts.push("PRIMARY KEY")
    else if (c.notNull) parts.push("NOT NULL")
    if (c.references) parts.push(`REFERENCES ${c.references}(code)`)
    return parts.join(" ")
  })
  const tuples = v.rows.map((row, i) => {
    const values = v.columns.map((c) => {
      if (c.name === "sort") return String(i + 1)
      if (c.translates) return sql(JSON.stringify(v.i18n[i]![c.translates]))
      if (c.name === "code") return sql(String(row.code))
      const value = row[c.name]
      if (value === null || value === undefined) return "NULL"
      if (typeof value === "number") return String(value)
      if (typeof value === "boolean") return value ? "1" : "0"
      return sql(String(value))
    })
    return `  (${values.join(", ")})`
  })
  return [
    `CREATE TABLE IF NOT EXISTS ${v.table} (`,
    ddl.join(",\n"),
    `);`,
    `INSERT OR IGNORE INTO ${v.table} (${v.columns.map((c) => c.name).join(", ")}) VALUES`,
    `${tuples.join(",\n")};`,
    ``,
  ].join("\n")
}


// ── Entities and relationships ─────────────────────────────────────────────
// The rest of the PO's data: the people, orgs, teams, events, players,
// divisions and venues, and the join rows between them. Emitted as a typed
// module so /api/seed loads the PO's fixtures rather than a hand-typed copy of
// them, which is how the seeded orgs came to disagree with biz on three names.

/** Entity display names, keyed `type|id|locale`. */
const ENTITY_NAMES = new Map<string, string>(
  readJsonl<{ entity_type: string; entity_id: string; locale_code: string; name: string }>(
    findSeed("entity_names.jsonl"),
  ).map((r) => [`${r.entity_type}|${r.entity_id}|${r.locale_code}`, r.name]),
)

function readFolder(folder: string, withNames: boolean): Record<string, Json[]> {
  const dir = resolve(BIZ, folder)
  if (!existsSync(dir)) missing(`${folder}/`)
  const out: Record<string, Json[]> = {}

  for (const file of readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort()) {
    const source = file.replace(/\.jsonl$/, "")
    const rows = readJsonl(resolve(dir, file)).map((row) => {
      const mapped: Json = {}
      for (const [k, v] of Object.entries(row)) mapped[camel(k)] = v
      if (!withNames) return mapped

      // Entity names live in their own store upstream, one row per locale.
      // They become the same `names` map every other localised thing carries.
      const type = singular(source)
      const names: Record<string, string> = {}
      for (const locale of LOCALES) {
        const value = ENTITY_NAMES.get(`${type}|${row.id}|${locale}`)
        if (value !== undefined) names[locale] = value
      }
      // `slug` is not derived here: the fixtures carry it, because it is a
      // public identifier the PO owns. Deriving it from the English name meant
      // renaming a school in English would silently move its URL.
      if (Object.keys(names).length) (mapped as Record<string, unknown>).names = names
      return mapped
    })
    out[camel(source)] = rows
  }
  return out
}

/**
 * Entities this repo does NOT generate a table for, and why.
 *
 * Everything else in the fixtures becomes a real table with real foreign keys.
 * These four cannot, and the reasons are structural rather than laziness:
 *
 *   users, orgs      Better Auth owns `user` and `organization`. It generates
 *                    their schema from src/auth.config.ts and their ids at
 *                    runtime, so a second definition here would fight it. The
 *                    fixtures still seed them — see src/routes/seed.ts.
 *   events, teams    already exist with columns the fixtures do not model:
 *                    `created_by` (the organiser as a Better Auth user),
 *                    `description`, and the deliberate absence of `org_id`
 *                    that migration 0005 recorded.
 */
const APP_OWNED = new Set(["users", "orgs", "events", "teams"])

const ENTITIES = readFolder("entities", true)
const RELATIONSHIPS = readFolder("relationships", false)

/**
 * What a `*_id` column points at.
 *
 * `user` and `organization` are Better Auth's tables; everything else is either
 * generated here or already exists. The fixtures' own ids are used verbatim for
 * events, teams and the tables below, so those foreign keys hold as written —
 * only `user_id` and `org_id` are translated at seed time, because Better Auth
 * generates those ids itself.
 */
const ENTITY_TABLE = new Map<string, string>([
  ["user", "user"],
  ["organizer_user", "user"],
  ["org", "organization"],
  ...Object.keys(ENTITIES).map((source) => [singular(source), singular(source)] as [string, string]),
  ["event", "event"],
  ["team", "team"],
])

/** Fixture tables this repo generates: everything the app does not already own. */
const GENERATED_ENTITIES = Object.entries(ENTITIES).filter(([source]) => !APP_OWNED.has(source))

/**
 * A table for a fixture the app does not already own.
 *
 * Columns and their types come from the data, exactly as they do for the
 * vocabularies — `*_code` columns resolve to the vocabulary they name, `*_id`
 * columns to the entity, so the database carries the PO's model with its real
 * constraints rather than a hand-typed approximation of it.
 */
function emitFixtureTable(source: string, rows: Json[], byEntity: Map<string, string>): string {
  const table = singular(source)
  const keys = Object.keys(rows[0]!)
  const fields = keys.map((key) => {
    const nullable = rows.some((r) => r[key] === null || r[key] === undefined)
    const sample = rows.find((r) => r[key] !== null && r[key] !== undefined)?.[key]
    const kind =
      key === "names"
        ? `text(${json("names")}, { mode: "json" }).$type<Names>().notNull()`
        : typeof sample === "number"
          ? `integer(${json(snake(key))})`
          : typeof sample === "boolean"
            ? `integer(${json(snake(key))}, { mode: "boolean" })`
            : `text(${json(snake(key))})`
    const parts = [kind]
    if (key === "id") parts.push("primaryKey()")
    else if (!nullable && key !== "names") parts.push("notNull()")

    const target = referenceFor(snake(key), byEntity)
    if (target) parts.push(`references(() => ${camel(target.table)}.${target.column})`)
    return `  ${key}: ${parts.join(".")},`
  })
  return [`export const ${camel(table)} = sqliteTable(${json(table)}, {`, ...fields, `})`, ``].join("\n")
}

const snake = (camelName: string) => camelName.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)

/** Resolve a `*_code` or `*_id` column to the table it points at. */
function referenceFor(
  column: string,
  byEntity: Map<string, string>,
): { table: string; column: string } | null {
  if (column.endsWith("_code")) {
    const want = singular(column.slice(0, -5))
    const suffix = VOCABULARIES.filter((v) => v.table.endsWith(`_${want}`))
    const target = VOCABULARIES.find((v) => v.table === want) ?? (suffix.length === 1 ? suffix[0] : undefined)
    return target ? { table: target.table, column: "code" } : null
  }
  if (column.endsWith("_id")) {
    const want = column.slice(0, -3)
    const table = byEntity.get(want) ?? byEntity.get(singular(want))
    return table ? { table, column: "id" } : null
  }
  return null
}

function emitFixtureSql(source: string, rows: Json[], byEntity: Map<string, string>): string {
  const table = singular(source)
  const keys = Object.keys(rows[0]!)
  const ddl = keys.map((key) => {
    const column = snake(key)
    const nullable = rows.some((r) => r[key] === null || r[key] === undefined)
    const sample = rows.find((r) => r[key] !== null && r[key] !== undefined)?.[key]
    const sqlType = key === "names" ? "TEXT" : typeof sample === "number" || typeof sample === "boolean" ? "INTEGER" : "TEXT"
    const parts = [`  ${column.padEnd(20)} ${sqlType}`]
    if (key === "id") parts.push("PRIMARY KEY")
    else if (!nullable) parts.push("NOT NULL")
    const target = referenceFor(column, byEntity)
    if (target) parts.push(`REFERENCES ${target.table}(${target.column})`)
    return parts.join(" ")
  })
  return [`CREATE TABLE IF NOT EXISTS ${table} (`, ddl.join(",\n"), `);`, ``].join("\n")
}

const emitRecord = (name: string, data: Record<string, Json[]>, doc: string) =>
  [
    doc,
    `export const ${name} = {`,
    ...Object.entries(data).map(
      ([key, rows]) =>
        `  ${key}: [\n${rows.map((r) => `    ${json(r)},`).join("\n")}\n  ],`,
    ),
    `} as const`,
    ``,
  ].join("\n")

// ── Headers and the static tail ────────────────────────────────────────────

const header = (what: string, c: string) =>
  `${c} GENERATED by \`mise run domain:generate\` — do not edit.
${c}
${c} ${what} for every reference vocabulary in remy-sport-biz. Add a file to the
${c} fixtures' reference/ folder and regenerate; nothing here is hand-maintained,
${c} and \`mise run domain:check\` fails when this goes stale.
${c}
${c} Display names live in JSON columns keyed by locale — \`names\`, \`descriptions\`
${c} — never a column per language. Each keeps its \`*_en\` pivot beside it: NOT
${c} NULL, so there is always something renderable, and sortable without reaching
${c} into JSON.
${c}
`

/**
 * Static tail of the migration: the `team` rebuild that adds the foreign keys.
 *
 * Not generated, because it is not derived from the fixtures — it is a one-off
 * schema change. It lives here so the tables and the constraints that depend on
 * them arrive together; a generated file that left `team` unconstrained would
 * defeat the point of ADR 015.
 */
const MIGRATION_TAIL = `-- Foreign keys are added by rebuilding \`team\`: SQLite cannot add a constraint
-- to an existing table. \`event\` and \`organization\` are deliberately left alone
-- for now — organization is Better Auth's table and rebuilding it would put
-- this migration in the way of a future generated schema, and event.province
-- is nullable free text on rows that predate the province list.
PRAGMA defer_foreign_keys = true;

CREATE TABLE team_new (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  names          TEXT NOT NULL DEFAULT '{}',
  org_id         TEXT NOT NULL REFERENCES organization(id),
  age_group_code TEXT NOT NULL REFERENCES age_group(code),
  gender_code    TEXT NOT NULL REFERENCES gender(code),
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

-- \`names\` is a JSON object keyed by locale. \`name\` stays beside it as the
-- English pivot: the guaranteed fallback and the column ORDER BY uses.
--
-- Any row whose code is not in the vocabulary would violate the new FK. The
-- copy filters rather than letting the rebuild fail halfway.
INSERT INTO team_new (id, name, names, org_id, age_group_code, gender_code, created_at, updated_at)
SELECT id, name, json_object('en', name), org_id, age_group_code, gender_code, created_at, updated_at
FROM team
WHERE age_group_code IN (SELECT code FROM age_group)
  AND gender_code    IN (SELECT code FROM gender);

DROP TABLE team;
ALTER TABLE team_new RENAME TO team;
CREATE INDEX IF NOT EXISTS team_org_idx ON team(org_id);
`

// ── Write ──────────────────────────────────────────────────────────────────

const outputs: Array<[string, string]> = [
  [
    OUT_TS,
    `${header("Typed constants", "//")}
/** Every language the fixtures declare, in the PO's order. */
export const LOCALES = [${LOCALES.map((l) => json(l)).join(", ")}] as const

export type Locale = (typeof LOCALES)[number]

${VOCABULARIES.map(emitConstants).join("\n")}`,
  ],
  [
    OUT_SCHEMA,
    `${header("Drizzle tables", "//")}
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"
import { createSelectSchema } from "drizzle-zod"
import { z } from "zod"
import type { Names } from "../domain/names"

${VOCABULARIES.map(emitDrizzle).join("\n")}
/**
 * Every vocabulary, keyed as the API exposes it.
 *
 * This is what lets /api/reference serve all of them without listing any: the
 * contract derives its response schema by mapping over this, and the handler
 * derives its queries the same way. Adding a fixture upstream adds a key here
 * and therefore a field on the endpoint, with nothing else to edit.
 */
export const VOCABULARY_TABLES = {
${VOCABULARIES.map((v) => `  ${camel(v.source)}: ${camel(v.table)},`).join("\n")}
} as const

/**
 * Each vocabulary's response schema, derived from its table.
 *
 * Emitted rather than built with Object.fromEntries at runtime, because that
 * erases the key literals and the API would lose its field types — the one
 * thing this whole arrangement exists to keep.
 */
export const VOCABULARY_SCHEMAS = {
${VOCABULARIES.map((v) => `  ${camel(v.source)}: z.array(createSelectSchema(${camel(v.table)})),`).join("\n")}
} as const

/** The column each vocabulary is ordered by when the API returns it. */
export const VOCABULARY_ORDER = {
${VOCABULARIES.map((v) => `  ${camel(v.source)}: ${camel(v.table)}.${v.columns.some((c) => c.name === "sort") ? "sort" : "nameEn"},`).join("\n")}
} as const
`,
  ],
  [MIGRATION, `${header("Tables and rows", "--")}\n${VOCABULARIES.map(emitSql).join("\n")}${MIGRATION_TAIL}`],
  [
    OUT_FIXTURES,
    `${header("Drizzle tables for the domain model", "//")}
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"
import type { Names } from "../domain/names"
import { user, organization } from "./auth-schema"
import { event, team } from "./app-schema"
${VOCABULARIES.map((v) => `import { ${camel(v.table)} } from "./vocabularies-schema"`).join("\n")}

${GENERATED_ENTITIES.map(([source, rows]) => emitFixtureTable(source, rows, ENTITY_TABLE)).join("\n")}
${Object.entries(RELATIONSHIPS).map(([source, rows]) => emitFixtureTable(source, rows, ENTITY_TABLE)).join("\n")}`,
  ],
  [
    MIGRATION_MODEL,
    `${header("The domain model", "--")}
-- Every entity and join table the Product Owner defines that this repo does not
-- already own. \`user\` and \`organization\` are Better Auth's; \`event\` and
-- \`team\` carry columns the fixtures do not model. Everything else is here,
-- with the foreign keys the fixtures imply.
--
-- Rows are loaded by /api/seed rather than inlined, because \`user_id\` and
-- \`org_id\` have to be translated from the fixtures' ids to the ones Better
-- Auth generates.

${GENERATED_ENTITIES.map(([source, rows]) => emitFixtureSql(source, rows, ENTITY_TABLE)).join("\n")}
${Object.entries(RELATIONSHIPS).map(([source, rows]) => emitFixtureSql(source, rows, ENTITY_TABLE)).join("\n")}`,
  ],
  [
    OUT_SEED,
    `${header("Seed rows", "//")}
${emitRecord(
  "SEED_ENTITIES",
  ENTITIES,
  `/**
 * The PO's entities, with their names already resolved per locale.
 *
 * /api/seed loads these rather than a hand-typed copy. The copy is how the
 * seeded organisations came to disagree with biz on three names with nothing
 * to notice — see ADR 015.
 */`,
)}
${emitRecord(
  "SEED_RELATIONSHIPS",
  RELATIONSHIPS,
  `/** The join rows between them: rosters, registrations, guardians, follows. */`,
)}`,
  ],
]

if (check) {
  const stale = outputs.filter(([path, want]) => {
    const current = existsSync(path) ? readFileSync(path, "utf8") : ""
    return current !== want
  })
  if (stale.length) {
    console.error(
      `domain:check: stale relative to remy-sport-biz — run 'mise run domain:generate'\n` +
        stale.map(([p]) => `  ${p}`).join("\n"),
    )
    process.exit(1)
  }
  console.log(`domain:check: ${VOCABULARIES.length} vocabularies and the seed match remy-sport-biz`)
  process.exit(0)
}

for (const [path, text] of outputs) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
}
console.log(
  `domain:generate: ${VOCABULARIES.length} vocabularies, ` +
    `${Object.keys(ENTITIES).length} entity tables, ` +
    `${Object.keys(RELATIONSHIPS).length} relationship tables, ` +
    `${LOCALES.length} locales`,
)
