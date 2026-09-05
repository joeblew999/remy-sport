/**
 * The Product Owner's model, as the statements that seed a database.
 *
 * Derived here, at import, from the model's entities and the drizzle tables —
 * there is no generated file in between. `POST /api/seed` executes these on a
 * real D1, every worker test file executes them on its own, and
 * `bun run db seed-remote` writes them out for wrangler to apply to a
 * deployment. One definition of "seeded", three callers, and nothing to
 * regenerate or keep in step.
 *
 * As SQL rather than as calls, so a database can be seeded without a running
 * Worker: an HTTP seed needs a server, so every spec had to share one database
 * and one set of actors, and Better Auth invalidates an OTP the moment a newer
 * one is requested for the same address — which was most of this repo's test
 * flakiness. As statements it is data, applied per test file in milliseconds.
 *
 * Two details make this possible rather than a fork of Better Auth's logic:
 *
 *   - Nothing here needs a password. `emailAndPassword` is off, and
 *     `account.password` is nullable — these accounts sign in by emailed code.
 *   - `account.issuer` must be `local:credential`. Migration 0007 established
 *     that; 1.7 matches `sign-in/email` on it, and a row without it fails with
 *     "User not found" while the seed still reports the user as created.
 *
 * Ids are the fixtures' own (`usr_admin_001`, `org_001`) rather than generated.
 * Better Auth does not mind what an id is, only that the rows are well formed.
 *
 * The order is the code below, and it is checked by every worker test file:
 * the statements run in one transaction with foreign keys deferred to its end,
 * against a database that was migrated moments before, so a row inserted ahead
 * of what it points at fails the whole tier with "FOREIGN KEY constraint
 * failed" and the table's name.
 */
import { getTableColumns, getTableName } from "drizzle-orm"
import { getTableConfig, type SQLiteTable } from "drizzle-orm/sqlite-core"
import * as schema from "./schema"
import { FIXTURE_TABLES } from "./fixtures-schema"
import { VOCABULARY_TABLES } from "./vocabularies-schema"
import { STORED_ROLE, VOCABULARY } from "../domain/vocabularies"
import { SEED_ENTITIES, SEED_RELATIONSHIPS } from "../domain/model/entities"
import { clean, pivot, type Names } from "../domain/names"

/** SQLite string literal. */
const q = (v: string | null | undefined) =>
  v === null || v === undefined ? "NULL" : `'${v.replace(/'/g, "''")}'`

/**
 * A timestamp column's unit, which drizzle decides and the raw SQL must match.
 *
 * `mode: "timestamp"` stores **seconds**; `mode: "timestamp_ms"` stores
 * milliseconds. Our own tables use the first and Better Auth's generated schema
 * uses the second, so one constant written into both is wrong in one of them.
 * It was: every seeded event and team was read back as year 57971 until
 * tests/worker/projection-equivalence.test.ts compared a date.
 */
const isSeconds = (column: unknown): boolean =>
  !!column && typeof column === "object" && (column as { mode?: string }).mode === "timestamp"

/**
 * A fixture value as SQL. `clean()` on the way in for a `names` column, because
 * it orders the keys by LOCALES — the same name written `{"th":…,"en":…}` by
 * one path and `{"en":…,"th":…}` by another holds different bytes.
 */
const lit = (v: unknown): string => {
  if (v === null || v === undefined) return "NULL"
  if (v instanceof Date) return String(v.getTime())
  if (typeof v === "boolean") return v ? "1" : "0"
  if (typeof v === "number") return String(v)
  if (typeof v === "object") return q(JSON.stringify(clean(v as Names)))
  return q(String(v))
}

/** Fixed, so a seeded database is byte-identical between runs. */
const AT = 1_767_225_600_000 // 2026-01-01T00:00:00Z

/**
 * The columns SQLite should treat as "this row already exists".
 *
 * A single-column primary key where there is one, otherwise the table's first
 * whole unique index — which is what every join table here has instead of a
 * key. A partial index (`userNotificationChannel_key` is unique only WHERE
 * channel_code <> 'PUSH') cannot be a conflict target.
 *
 * Derived rather than passed in: a table nobody remembered to pass it for
 * stayed `INSERT OR IGNORE`, and IGNORE cannot repair a row that is already
 * there — `event.description` and `playerTeam.to_date` were both added to the
 * model and neither reached a development database whose rows predated them.
 */
function conflictTarget(table: SQLiteTable): string[] {
  const config = getTableConfig(table)
  const pk = config.columns.filter((c) => c.primary).map((c) => c.name)
  if (pk.length === 1) return pk
  const unique = config.indexes.find((i) => i.config.unique && !i.config.where)
  return unique?.config.columns.map((c) => (c as { name: string }).name) ?? []
}

/**
 * One row, as an INSERT that updates in place on conflict.
 *
 * Column names come from the drizzle table, and only the columns the row
 * carries are named, so the table's defaults apply to the rest. Update rather
 * than replace: the key is a foreign key, and INSERT OR REPLACE deletes the
 * row first, which would take its children with it.
 */
function insertOf(table: SQLiteTable, row: Record<string, unknown>, opts: { upsertOn?: string } = {}): string {
  const cols = getTableColumns(table)
  const present = Object.keys(cols).filter((k) => k in row)
  const value = (k: string) => {
    const v = row[k]
    // Seconds or milliseconds is the column's decision, not the caller's.
    if (typeof v === "number" && isSeconds(cols[k])) return String(Math.floor(v / 1000))
    if (v instanceof Date && isSeconds(cols[k])) return String(Math.floor(v.getTime() / 1000))
    return lit(v)
  }
  const head =
    `INSERT INTO ${getTableName(table)} ` +
    `(${present.map((k) => cols[k]!.name).join(", ")}) VALUES ` +
    `(${present.map(value).join(", ")})`

  const key = opts.upsertOn ? [opts.upsertOn] : conflictTarget(table)
  // Nothing to conflict on, so nothing to update. Only a table with neither a
  // primary key nor a unique index reaches this, and there are none.
  if (key.length === 0) return `INSERT OR IGNORE${head.slice("INSERT".length)}`

  const set = present
    .filter((k) => !key.includes(cols[k]!.name))
    .map((k) => `${cols[k]!.name} = excluded.${cols[k]!.name}`)
    .join(", ")
  // A row whose every column is part of the key has nothing to update, and
  // `DO UPDATE SET` with an empty list is a syntax error.
  if (!set) return `${head} ON CONFLICT(${key.join(", ")}) DO NOTHING`
  return `${head} ON CONFLICT(${key.join(", ")}) DO UPDATE SET ${set}`
}

function build(): string[] {
  const out: string[] = [
    // One transaction, foreign keys checked once at the end: vocabularies
    // reference each other, and ordering twenty-one of them by dependency
    // would be a second model of the references the columns already declare.
    "PRAGMA defer_foreign_keys = true",
  ]

  /**
   * The controlled vocabularies first — everything below has a foreign key
   * into one of them. `sort` is the fixtures' own order, which is how
   * /api/reference returns them. Every locale-keyed JSON column has a NOT NULL
   * `*_en` pivot beside it, materialised here. Vocabularies upsert: the PO
   * owns them absolutely, and a renamed city is a correction every database
   * must see.
   */
  for (const [name, table] of Object.entries(VOCABULARY_TABLES) as [string, SQLiteTable][]) {
    const rows = (VOCABULARY as Record<string, readonly Record<string, unknown>[]>)[name]
    if (!rows?.length) continue
    for (const [i, row] of rows.entries()) {
      const values: Record<string, unknown> = { sort: i + 1 }
      for (const [key, v] of Object.entries(row)) {
        values[key] = v
        if (v && typeof v === "object") values[`${key.replace(/s$/, "")}En`] = pivot(v as Names) ?? ""
      }
      out.push(insertOf(table, values, { upsertOn: "code" }))
    }
  }

  // Users, upserted: these rows outlive the schema, and a column added later
  // (status_code, migration 0008) has to reach rows that predate it. One
  // credential account per user, with the issuer 1.7 matches sign-in on.
  for (const u of SEED_ENTITIES.users) {
    out.push(
      insertOf(
        schema.user,
        {
          id: u.id,
          name: pivot(u.names)!,
          email: u.email,
          emailVerified: true,
          createdAt: AT,
          updatedAt: AT,
          role: STORED_ROLE[u.roleCode],
          bizId: u.id,
          // JSON in a text column, not drizzle's `mode: "json"`: this table is
          // generated by Better Auth's CLI from `additionalFields`, which only
          // speaks scalars. src/domain/names.ts reads it either way.
          names: JSON.stringify(u.names),
          localeCode: u.localeCode,
          statusCode: u.statusCode,
          // Banned is Better Auth's, `status_code` is the domain's, and they
          // are not the same fact: one refuses a sign-in, the other is where a
          // person is in their lifecycle.
          banned: "banned" in u ? u.banned : null,
          banReason: "banReason" in u ? u.banReason : null,
          banExpires: "banExpires" in u ? u.banExpires : null,
        } satisfies Partial<Record<keyof typeof schema.user.$inferInsert, unknown>>,
        { upsertOn: "id" },
      ),
      insertOf(schema.account, {
        id: `acc_${u.id}`,
        issuer: "local:credential",
        accountId: u.id,
        providerId: "credential",
        userId: u.id,
        createdAt: AT,
        updatedAt: AT,
      } satisfies Partial<Record<keyof typeof schema.account.$inferInsert, unknown>>),
    )
  }

  /**
   * The fixture tables, in FIXTURE_TABLES' order — except that `org` must come
   * before the teams and events below, which have NOT NULL foreign keys into
   * it, while `player` and `eventTeam` need `team` first. The graph
   * interleaves, so it is two passes over one list.
   */
  const fixtures = (wanted: (name: string) => boolean) => {
    for (const [name, table] of Object.entries(FIXTURE_TABLES) as [string, SQLiteTable][]) {
      if (!wanted(name)) continue
      const source = SEED_ENTITIES as Record<string, readonly Record<string, unknown>[] | undefined>
      const rows = source[name] ?? (SEED_RELATIONSHIPS as Record<string, readonly Record<string, unknown>[]>)[name]
      if (!rows?.length) continue
      for (const row of rows) out.push(insertOf(table, row))
    }
  }
  const BEFORE_ENTITIES = new Set(["orgs"])
  fixtures((n) => BEFORE_ENTITIES.has(n))

  // Rosters and events. `name` is the English pivot beside the locale-keyed
  // `names`; `organizer_user_id` is the organiser as the fixtures name it.
  for (const t of SEED_ENTITIES.teams) {
    out.push(
      insertOf(schema.team, {
        id: t.id,
        name: pivot(t.names)!,
        names: clean(t.names),
        orgId: t.orgId,
        ageGroupCode: t.ageGroupCode,
        genderCode: t.genderCode,
        createdAt: AT,
        updatedAt: AT,
      } satisfies Partial<Record<keyof typeof schema.team.$inferInsert, unknown>>),
    )
  }
  for (const e of SEED_ENTITIES.events) {
    out.push(
      insertOf(schema.event, {
        id: e.id,
        name: pivot(e.names)!,
        names: clean(e.names),
        typeCode: e.typeCode,
        formatCode: e.formatCode,
        timezone: e.timezone,
        startDate: e.startDate,
        endDate: e.endDate,
        cityCode: e.cityCode,
        provinceCode: e.provinceCode,
        isFibaCertified: e.isFibaCertified,
        orgId: e.orgId,
        // Optional in the model and optional here: two of the four seeded
        // events carry one, so the section's empty state stays covered.
        description: "description" in e ? e.description : null,
        organizerUserId: e.organizerUserId,
        createdAt: AT,
        updatedAt: AT,
      } satisfies Partial<Record<keyof typeof schema.event.$inferInsert, unknown>>),
    )
  }

  fixtures((n) => !BEFORE_ENTITIES.has(n))

  // Which divisions each event runs, derived from the teams already in it:
  // `eventDivision` is this repo's table, not one of the PO's fixtures.
  const eventDivisions = new Set(SEED_RELATIONSHIPS.eventTeams.map((t) => `${t.eventId}|${t.divisionId}`))
  for (const key of [...eventDivisions].sort()) {
    const [eventId, divisionId] = key.split("|") as [string, string]
    out.push(insertOf(schema.eventDivision, { eventId, divisionId }))
  }

  return out
}

/** Every statement, in order. `PRAGMA` first, so the batch is one transaction. */
export const SEED_STATEMENTS: string[] = build()
