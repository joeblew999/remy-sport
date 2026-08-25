/**
 * Generate src/domain/vocabularies.ts from the Product Owner's fixtures.
 *
 * The controlled vocabularies were written out in six places: the biz JSONL,
 * migration 0009, two route files as `z.enum([...])`, the SPA as TS unions plus
 * a label map, and the tests as assertion lists. Five copies of one list, none
 * of them checked against the original — and they had already drifted: biz
 * calls COED "Co-ed" while the SPA rendered "Mixed".
 *
 * This is the same shape as `auth:schema:generate` (ADR 006 §9e), and for the
 * same reason: a file generated from a source of truth, committed, with a
 * `--check` mode that fails when it goes stale. The generated file is committed
 * so ordinary builds never need the biz repo — only regeneration does.
 *
 * LANGUAGES ARE ROWS, NOT COLUMNS. This generator used to read a `name_th`
 * column off each fixture and emit a `name_th` column into the database and a
 * `nameTh` field into TypeScript. Adding a third language then meant a schema
 * migration, a regenerated type, and an edit to every consumer — for data.
 * Upstream fixed this: English is the pivot on the fixture row (`name_en`) and
 * every other language is a row in translations.jsonl. This file mirrors that,
 * so adding a language upstream is a regeneration here and nothing else.
 *
 * Run: mise run domain:generate  /  mise run domain:check
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs"
import { dirname, resolve } from "path"

const BIZ = resolve(import.meta.dir, "../../remy-sport-biz/data/seed")
const OUT = resolve(import.meta.dir, "../src/domain/vocabularies.ts")
const MIGRATION = resolve(import.meta.dir, "../src/db/migrations/0009_reference_vocabularies.sql")
const check = process.argv.includes("--check")

function fail(message: string): never {
  console.error(message)
  process.exit(2)
  throw new Error(message) // unreachable; keeps the `never` honest without @types/node
}

function missingFixture(what: string): never {
  return fail(
    `domain-generate: ${what} not found under ${BIZ}.\n` +
      `  The vocabularies come from the remy-sport-biz repo, which AGENTS.md\n` +
      `  expects cloned at ../remy-sport-biz/. Clone it, or skip this task —\n` +
      `  src/domain/vocabularies.ts is committed, so building does not need it.`,
  )
}

/**
 * Find a fixture by file name, wherever it sits under data/seed.
 *
 * The fixtures are grouped into reference/, entities/, relationships/,
 * authorization/ and localization/, and that grouping is upstream's to change —
 * it is how each file declares the way it is localized. Resolving by name
 * rather than by a path hardcoded here means a regrouping upstream cannot break
 * this generator, which is exactly how it broke when the folders were introduced.
 */
function findSeed(file: string): string {
  if (!existsSync(BIZ)) missingFixture(file)
  const stack = [BIZ]
  while (stack.length) {
    const dir = stack.pop()!
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) stack.push(resolve(dir, entry.name))
      else if (entry.name === file) return resolve(dir, entry.name)
    }
  }
  return missingFixture(file)
}

function readJsonl<T>(file: string): T[] {
  return readFileSync(findSeed(file), "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T)
}

/** Every language the fixtures declare, English first so it reads as the pivot. */
const LOCALES: string[] = (() => {
  const codes = readJsonl<{ code: string }>("locales.jsonl").map((l) => l.code)
  return [...codes].sort((a, b) => (a === "en" ? -1 : b === "en" ? 1 : a.localeCompare(b)))
})()

/** Non-English display strings, keyed `table|record|field|locale`. */
const TRANSLATIONS: Map<string, string> = (() => {
  const map = new Map<string, string>()
  for (const r of readJsonl<{
    table_name: string
    record_key: string
    field_name: string
    locale_code: string
    value: string
  }>("translations.jsonl")) {
    map.set(`${r.table_name}|${r.record_key}|${r.field_name}|${r.locale_code}`, r.value)
  }
  return map
})()

interface Row {
  code: string
  /** locale code -> display name, one entry for every declared locale */
  names: Record<string, string>
  min_age?: number | null
  max_age?: number | null
  province_code?: string
}

/**
 * A fixture row, with its names resolved for every declared locale.
 *
 * English comes off the row's `name_en` pivot; everything else comes from
 * translations.jsonl. Upstream guarantees a value for each declared locale and
 * fails its own build otherwise, so a miss here means the checkout is stale
 * rather than that a fallback is needed — hence the hard error.
 */
function read(v: Vocab): Row[] {
  const table = v.file.replace(/\.jsonl$/, "")
  return readJsonl<{
    code: string
    name_en: string
    min_age?: number | null
    max_age?: number | null
    province_code?: string
  }>(v.file).map((row) => {
    const names: Record<string, string> = {}
    for (const locale of LOCALES) {
      // Keyed by the fixture's own code — eventType lowercases on the way out
      // only, so looking up by the emitted code would miss every row.
      const value = locale === "en" ? row.name_en : TRANSLATIONS.get(`${table}|${row.code}|name|${locale}`)
      if (value === undefined) {
        fail(
          `domain-generate: no '${locale}' name for ${table}.${row.code}.\n` +
            `  Upstream guarantees a translation for every declared locale —\n` +
            `  run 'mise run data:check' in remy-sport-biz to see what is missing.`,
        )
      }
      names[locale] = value
    }
    return {
      code: row.code,
      names,
      min_age: row.min_age,
      max_age: row.max_age,
      province_code: row.province_code,
    }
  })
}

/**
 * A row's code, with the one deliberate delta applied.
 *
 * Event types are lowercased: migrations 0005 and 0009 recorded why — this
 * repo's published OpenAPI enum is lowercase, and changing it would break
 * existing clients for no gain. The mapping is one-to-one.
 *
 * This lives on the vocabulary record rather than in a lookup keyed by
 * filename, because that is what went wrong before: the set held
 * "event_types" and was queried with "event_types.jsonl", so it never matched
 * and every consumer of the generated file would have got TOURNAMENT where the
 * database and the routes say tournament. A flag on the record cannot miss.
 */
function code(v: Vocab, row: Row): string {
  return v.lowercase ? row.code.toLowerCase() : row.code
}

const json = (v: unknown) => JSON.stringify(v)

function emit(v: Vocab, rows: Row[]): string {
  const { name, file } = v
  const codes = rows.map((r) => code(v, r))
  const entries = rows.map((r, i) => {
    const names = LOCALES.map((l) => `${l}: ${json(r.names[l])}`).join(", ")
    const age =
      r.min_age !== undefined || r.max_age !== undefined
        ? `, minAge: ${r.min_age ?? "null"}, maxAge: ${r.max_age ?? "null"}`
        : ""
    return `  { code: ${json(codes[i]!)}, names: { ${names} }${age} },`
  })
  const upper = name.replace(/([A-Z])/g, "_$1").toUpperCase()
  return [
    `/** ${rows.length} rows, from ${file}. */`,
    `export const ${upper} = [`,
    ...entries,
    `] as const satisfies readonly Term[]`,
    ``,
    `export const ${upper}_CODES = ${upper}.map((t) => t.code) as unknown as [`,
    `  ${codes.map((c) => json(c)).join(",\n  ")},`,
    `]`,
    ``,
    `export type ${name[0]!.toUpperCase()}${name.slice(1)}Code = (typeof ${upper}_CODES)[number]`,
    ``,
  ].join("\n")
}

/**
 * One vocabulary: where it comes from, and the table it seeds.
 *
 * `ddl` is written out rather than derived. The rows are the PO's data and are
 * generated; the shape of the table is this repo's decision, and inventing it
 * from the JSONL would mean guessing at types and nullability that the fixtures
 * do not state. So: data generated, structure declared, both in one file.
 */
interface Vocab {
  name: string
  file: string
  table: string
  /** Columns on the vocabulary table itself. Display names are NOT among them. */
  columns: string[]
  ddl: string
  /** Lowercase the codes on the way out. See `code()`. */
  lowercase?: boolean
}

/**
 * The columns every vocabulary table has, plus whatever it adds.
 *
 * `name_en` stays on the row as the pivot, mirroring the fixtures: it is the
 * guaranteed non-null fallback when a locale has no row, and it is what
 * `province` is ordered by. Every language INCLUDING English is also a row in
 * `translation`, so a query that renders in a locale is one uniform join with
 * no special case for English.
 *
 * Joined rather than concatenated so the last column never carries a trailing
 * comma — `province` adds nothing, and a naive template produced
 * `name_en TEXT NOT NULL, );`, which SQLite rejects.
 */
const REF = (...extra: string[]) =>
  ["  code    TEXT PRIMARY KEY", "  name_en TEXT NOT NULL", ...extra].join(",\n")

const VOCABULARIES: Vocab[] = [
  {
    name: "ageGroup",
    file: "age_groups.jsonl",
    table: "age_group",
    columns: ["code", "name_en", "min_age", "max_age", "sort"],
    ddl: REF("  min_age INTEGER", "  max_age INTEGER", "  sort    INTEGER NOT NULL"),
  },
  {
    name: "gender",
    file: "genders.jsonl",
    table: "gender",
    columns: ["code", "name_en", "sort"],
    ddl: REF("  sort    INTEGER NOT NULL"),
  },
  {
    name: "orgType",
    file: "org_types.jsonl",
    table: "org_type",
    columns: ["code", "name_en", "sort"],
    ddl: REF("  sort    INTEGER NOT NULL"),
  },
  {
    name: "eventType",
    file: "event_types.jsonl",
    table: "event_type",
    columns: ["code", "name_en", "sort"],
    ddl: REF("  sort    INTEGER NOT NULL"),
    lowercase: true,
  },
  {
    name: "eventFormat",
    file: "event_formats.jsonl",
    table: "event_format",
    columns: ["code", "name_en", "sort"],
    ddl: REF("  sort    INTEGER NOT NULL"),
  },
  {
    // No `sort`: /api/reference orders provinces by name_en, because 15 of 77
    // provinces have no meaningful curated order the way age groups do.
    name: "province",
    file: "provinces.jsonl",
    table: "province",
    columns: ["code", "name_en"],
    ddl: REF(),
  },
  {
    // After `province`: the FK target has to exist first. Cities are a
    // vocabulary rather than free text for the same reason provinces are —
    // "Bangkok" typed into a column cannot be shown to a Thai user as
    // กรุงเทพมหานคร, and biz models them as `city_code` for exactly that reason.
    name: "city",
    file: "cities.jsonl",
    table: "city",
    columns: ["code", "name_en", "province_code"],
    ddl: REF("  province_code TEXT NOT NULL REFERENCES province(code)"),
  },
]

const localeList = LOCALES.map((l) => json(l)).join(", ")

const header = `// GENERATED by \`mise run domain:generate\` — do not edit.
//
// Source: the remy-sport-biz fixtures, which AGENTS.md names as the source of
// truth for domain definitions. Edit the vocabularies there and regenerate;
// \`mise run domain:check\` fails when this file is stale.
//
// Languages are rows, not columns: \`names\` carries one entry per locale
// declared in the fixtures, so adding a language is a regeneration and nothing
// more. Nothing here should ever grow a \`nameXx\` field.
//
// Event type codes are lowercased here, a deliberate delta from the fixtures
// recorded in migrations 0005 and 0009 — this repo's published OpenAPI enum is
// lowercase and changing it would break clients.

/** Every language the fixtures declare. English first: it is the pivot. */
export const LOCALES = [${localeList}] as const

export type Locale = (typeof LOCALES)[number]

/** A term in a controlled vocabulary, named in every declared locale. */
export interface Term {
  readonly code: string
  readonly names: Readonly<Record<Locale, string>>
  readonly minAge?: number | null
  readonly maxAge?: number | null
}

/** Look up a display name, falling back to English and then to the code. */
export function label(terms: readonly Term[], code: string, locale: Locale = "en"): string {
  const term = terms.find((t) => t.code === code)
  if (!term) return code
  return term.names[locale] ?? term.names.en ?? code
}
`

/** SQL string literal. Doubles quotes — Thai names are data, not trusted input. */
const sql = (s: string) => `'${s.replace(/'/g, "''")}'`

/**
 * A row's values, in `columns` order.
 *
 * `sort` is the fixture's own ordering, 1-based. That is the whole reason the
 * column exists: sorting age groups by code gives OPEN, SENIOR, U10, U12…,
 * which is useless in a dropdown. Keeping it positional means the PO controls
 * display order by ordering the JSONL, with nothing to hand-maintain here.
 */
function values(v: Vocab, row: Row, code: string, i: number): string {
  return v.columns
    .map((col) => {
      switch (col) {
        case "code":
          return sql(code)
        case "name_en":
          return sql(row.names.en!)
        case "min_age":
          return row.min_age ?? "NULL"
        case "max_age":
          return row.max_age ?? "NULL"
        case "province_code":
          return sql(row.province_code!)
        case "sort":
          return String(i + 1)
        default:
          throw new Error(`domain-generate: unknown column ${col}`)
      }
    })
    .join(", ")
}

function emitSql(v: Vocab, rows: Row[]): string {
  const tuples = rows.map((r, i) => `  (${values(v, r, code(v, r), i)})`)
  return [
    `CREATE TABLE IF NOT EXISTS ${v.table} (`,
    v.ddl,
    `);`,
    `INSERT OR IGNORE INTO ${v.table} (${v.columns.join(", ")}) VALUES`,
    `${tuples.join(",\n")};`,
    ``,
  ].join("\n")
}

/**
 * The localisation tables, mirroring the fixtures' own two stores.
 *
 * `translation` is keyed exactly as upstream keys it, except that
 * `record_key` holds THIS repo's code — event types are lowercase here, and a
 * catalogue keyed by the fixture's uppercase code could never be joined.
 */
function emitLocalisation(): string {
  const locales = readJsonl<{ code: string; name_en: string }>("locales.jsonl")
  const localeRows = LOCALES.map((code) => {
    const row = locales.find((l) => l.code === code)!
    return `  (${sql(row.code)}, ${sql(row.name_en)})`
  })

  const translationRows: string[] = []
  for (const v of VOCABULARIES) {
    for (const row of read(v)) {
      for (const locale of LOCALES) {
        translationRows.push(
          `  (${sql(v.table)}, ${sql(code(v, row))}, 'name', ${sql(locale)}, ${sql(row.names[locale]!)})`,
        )
      }
    }
  }

  return [
    `CREATE TABLE IF NOT EXISTS locale (`,
    `  code    TEXT PRIMARY KEY,`,
    `  name_en TEXT NOT NULL`,
    `);`,
    `INSERT OR IGNORE INTO locale (code, name_en) VALUES`,
    `${localeRows.join(",\n")};`,
    ``,
    `-- One row per term per locale. A new language is INSERTs here and nothing`,
    `-- else: no ALTER TABLE, no regenerated type, no consumer changes.`,
    `CREATE TABLE IF NOT EXISTS translation (`,
    `  table_name  TEXT NOT NULL,`,
    `  record_key  TEXT NOT NULL,`,
    `  field_name  TEXT NOT NULL,`,
    `  locale_code TEXT NOT NULL REFERENCES locale(code),`,
    `  value       TEXT NOT NULL,`,
    `  PRIMARY KEY (table_name, record_key, field_name, locale_code)`,
    `);`,
    `INSERT OR IGNORE INTO translation (table_name, record_key, field_name, locale_code, value) VALUES`,
    `${translationRows.join(",\n")};`,
    ``,
  ].join("\n")
}

/**
 * Static tail of the migration: the `team` rebuild that adds the foreign keys.
 *
 * Not generated, because it is not derived from the fixtures — it is a one-off
 * schema change. It lives here rather than in a separate migration so that the
 * tables and the constraints that depend on them arrive together; a generated
 * file that left `team` unconstrained would defeat the point of ADR 015.
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
  org_id         TEXT NOT NULL REFERENCES organization(id),
  age_group_code TEXT NOT NULL REFERENCES age_group(code),
  gender_code    TEXT NOT NULL REFERENCES gender(code),
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

-- \`name\` is the English pivot and stays on the row. Thai — and any other
-- language — is a \`translation\` row keyed ('team', id, 'name', locale), the
-- same rule the vocabularies follow. That is why \`name_th\` is not rebuilt.
--
-- Any row whose code is not in the vocabulary would violate the new FK. The
-- copy filters rather than letting the rebuild fail halfway.
INSERT INTO team_new (id, name, org_id, age_group_code, gender_code, created_at, updated_at)
SELECT id, name, org_id, age_group_code, gender_code, created_at, updated_at
FROM team
WHERE age_group_code IN (SELECT code FROM age_group)
  AND gender_code    IN (SELECT code FROM gender);

DROP TABLE team;
ALTER TABLE team_new RENAME TO team;
CREATE INDEX IF NOT EXISTS team_org_idx ON team(org_id);
`

const SQL_HEADER = `-- GENERATED by \`mise run domain:generate\` — do not edit.
--
-- ADR 015: the controlled vocabularies are tables, seeded from the
-- remy-sport-biz fixtures. This file used to be hand-typed from those
-- fixtures, which ADR 015 recorded as a known limitation: nothing regenerated
-- one from the other, so a change upstream meant editing a migration by hand
-- and hoping a test noticed. Now the rows come from the fixtures directly and
-- \`mise run domain:check\` fails when they diverge.
--
-- Display names are NOT columns on these tables. Each vocabulary keeps
-- \`name_en\` as its pivot — the guaranteed fallback, and the province sort key
-- — and every language including English is a row in \`translation\`. Adding a
-- language is INSERTs, never a schema change.
--
-- Seeded in the migration rather than through /api/seed, because the foreign
-- keys at the bottom have to be satisfiable the moment they exist.
--
-- Event type codes are lowercased, a deliberate delta from the fixtures that
-- migration 0005 recorded: this repo's published OpenAPI enum is lowercase and
-- changing it would break existing clients for no gain. The mapping is 1:1.

`

const rowsFor = new Map(VOCABULARIES.map((v) => [v.name, read(v)]))

const body = VOCABULARIES.map((v) => emit(v, rowsFor.get(v.name)!)).join("\n")
const content = `${header}\n${body}`
const sqlContent =
  SQL_HEADER +
  emitLocalisation() +
  "\n" +
  VOCABULARIES.map((v) => emitSql(v, rowsFor.get(v.name)!)).join("\n") +
  MIGRATION_TAIL

const outputs: Array<[string, string]> = [
  [OUT, content],
  [MIGRATION, sqlContent],
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
  console.log("domain:check: vocabularies.ts and migration 0009 match remy-sport-biz")
  process.exit(0)
}

for (const [path, text] of outputs) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
}
