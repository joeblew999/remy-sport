// AUTHORED. Not generated — this is the root of the chain.
//
// Everything above these tables is derived from them and nothing below is:
//
//   drizzle table -> createSelectSchema -> oRPC .output() -> RouterClient -> React
//
// They were generated from remy-sport-biz's JSONL until 2026-08-27, which
// inverted that: the data defined the schema, and a string-stitching script had
// to be taught about `$type<Names>()`, the vocabulary-derived enums and the
// unique indexes one feature at a time. Every silent bug that day lived in that
// transform.
//
// The Product Owner's model still drives what these tables are — a person reads
// the model and writes the table. What proves the two agree is the
// seed: `db.insert(city).values(CITY)` does not compile if the data and the
// column disagree, which is a stronger check than any script comparing them.
//
// Tables for the controlled vocabularies.

import { sqliteTable, text, integer, type SQLiteTable } from "drizzle-orm/sqlite-core"
import { createSelectSchema } from "drizzle-zod"
import { z } from "zod"
import type { Names } from "../domain/names"
import type { VOCABULARY } from "../domain/vocabularies"

export const objectType = sqliteTable("object_type", {
  code: text("code").primaryKey(),
  nameEn: text("name_en").notNull(),
  names: text("names", { mode: "json" }).$type<Names>().notNull(),
  descriptionEn: text("description_en").notNull(),
  descriptions: text("descriptions", { mode: "json" }).$type<Names>().notNull(),
  tableName: text("table_name"),
  sort: integer("sort").notNull(),
})

export const action = sqliteTable("action", {
  code: text("code").primaryKey(),
  objectTypeCode: text("object_type_code").notNull().references(() => objectType.code),
  category: text("category").notNull(),
  nameEn: text("name_en").notNull(),
  names: text("names", { mode: "json" }).$type<Names>().notNull(),
  sort: integer("sort").notNull(),
})

export const ageGroup = sqliteTable("age_group", {
  code: text("code").primaryKey(),
  nameEn: text("name_en").notNull(),
  names: text("names", { mode: "json" }).$type<Names>().notNull(),
  minAge: integer("min_age"),
  maxAge: integer("max_age"),
  sort: integer("sort").notNull(),
})

export const province = sqliteTable("province", {
  code: text("code").primaryKey(),
  nameEn: text("name_en").notNull(),
  names: text("names", { mode: "json" }).$type<Names>().notNull(),
  sort: integer("sort").notNull(),
})

export const city = sqliteTable("city", {
  code: text("code").primaryKey(),
  nameEn: text("name_en").notNull(),
  names: text("names", { mode: "json" }).$type<Names>().notNull(),
  provinceCode: text("province_code").notNull().references(() => province.code),
  sort: integer("sort").notNull(),
})

export const coachRole = sqliteTable("coach_role", {
  code: text("code").primaryKey(),
  nameEn: text("name_en").notNull(),
  names: text("names", { mode: "json" }).$type<Names>().notNull(),
  sort: integer("sort").notNull(),
})

export const eventFormat = sqliteTable("event_format", {
  code: text("code").primaryKey(),
  nameEn: text("name_en").notNull(),
  names: text("names", { mode: "json" }).$type<Names>().notNull(),
  sort: integer("sort").notNull(),
})

export const eventType = sqliteTable("event_type", {
  code: text("code").primaryKey(),
  nameEn: text("name_en").notNull(),
  names: text("names", { mode: "json" }).$type<Names>().notNull(),
  descriptionEn: text("description_en").notNull(),
  descriptions: text("descriptions", { mode: "json" }).$type<Names>().notNull(),
  sort: integer("sort").notNull(),
})

export const gender = sqliteTable("gender", {
  code: text("code").primaryKey(),
  nameEn: text("name_en").notNull(),
  names: text("names", { mode: "json" }).$type<Names>().notNull(),
  sort: integer("sort").notNull(),
})

export const guardianType = sqliteTable("guardian_type", {
  code: text("code").primaryKey(),
  nameEn: text("name_en").notNull(),
  names: text("names", { mode: "json" }).$type<Names>().notNull(),
  sort: integer("sort").notNull(),
})

/**
 * Whether an invitation is outstanding or taken up.
 *
 * The `CO_ORGANIZER` relation filters on `ACCEPTED`, so a pending invitation
 * grants nothing — which is what makes `ACCEPT_CO_ORGANIZER_INVITE` an action
 * rather than a formality.
 */
export const inviteStatus = sqliteTable("invite_status", {
  code: text("code").primaryKey(),
  nameEn: text("name_en").notNull(),
  names: text("names", { mode: "json" }).$type<Names>().notNull(),
  sort: integer("sort").notNull(),
})

/**
 * The states a game moves through: upcoming, live, half-time, finished.
 *
 * `CONFIRM_MATCH_STATUS` is the action that moves it, and it is scoped to the
 * game rather than the event — see the GAME relations in the model.
 */
export const gameStatus = sqliteTable("game_status", {
  code: text("code").primaryKey(),
  nameEn: text("name_en").notNull(),
  names: text("names", { mode: "json" }).$type<Names>().notNull(),
  sort: integer("sort").notNull(),
})

export const locale = sqliteTable("locale", {
  code: text("code").primaryKey(),
  nameEn: text("name_en").notNull(),
  names: text("names", { mode: "json" }).$type<Names>().notNull(),
  status: text("status").notNull(),
  sort: integer("sort").notNull(),
})

export const notificationCategory = sqliteTable("notification_category", {
  code: text("code").primaryKey(),
  nameEn: text("name_en").notNull(),
  names: text("names", { mode: "json" }).$type<Names>().notNull(),
  sort: integer("sort").notNull(),
})

export const notificationChannel = sqliteTable("notification_channel", {
  code: text("code").primaryKey(),
  nameEn: text("name_en").notNull(),
  names: text("names", { mode: "json" }).$type<Names>().notNull(),
  addressFormat: text("address_format").notNull(),
  descriptionEn: text("description_en").notNull(),
  descriptions: text("descriptions", { mode: "json" }).$type<Names>().notNull(),
  sort: integer("sort").notNull(),
})

export const notificationType = sqliteTable("notification_type", {
  code: text("code").primaryKey(),
  categoryCode: text("category_code").notNull().references(() => notificationCategory.code),
  nameEn: text("name_en").notNull(),
  names: text("names", { mode: "json" }).$type<Names>().notNull(),
  descriptionEn: text("description_en").notNull(),
  descriptions: text("descriptions", { mode: "json" }).$type<Names>().notNull(),
  sort: integer("sort").notNull(),
})

export const orgRole = sqliteTable("org_role", {
  code: text("code").primaryKey(),
  nameEn: text("name_en").notNull(),
  names: text("names", { mode: "json" }).$type<Names>().notNull(),
  sort: integer("sort").notNull(),
})

export const orgType = sqliteTable("org_type", {
  code: text("code").primaryKey(),
  nameEn: text("name_en").notNull(),
  names: text("names", { mode: "json" }).$type<Names>().notNull(),
  sort: integer("sort").notNull(),
})

export const position = sqliteTable("position", {
  code: text("code").primaryKey(),
  nameEn: text("name_en").notNull(),
  names: text("names", { mode: "json" }).$type<Names>().notNull(),
  fullNameEn: text("full_name_en").notNull(),
  fullNames: text("full_names", { mode: "json" }).$type<Names>().notNull(),
  sort: integer("sort").notNull(),
})

export const role = sqliteTable("role", {
  code: text("code").primaryKey(),
  nameEn: text("name_en").notNull(),
  names: text("names", { mode: "json" }).$type<Names>().notNull(),
  descriptionEn: text("description_en").notNull(),
  descriptions: text("descriptions", { mode: "json" }).$type<Names>().notNull(),
  sort: integer("sort").notNull(),
})

export const relation = sqliteTable("relation", {
  code: text("code").primaryKey(),
  objectTypeCode: text("object_type_code").notNull().references(() => objectType.code),
  nameEn: text("name_en").notNull(),
  names: text("names", { mode: "json" }).$type<Names>().notNull(),
  via: text("via").notNull(),
  sourceTable: text("source_table"),
  objectColumn: text("object_column"),
  userColumn: text("user_column"),
  filterColumn: text("filter_column"),
  filterValue: text("filter_value"),
  throughTable: text("through_table"),
  throughColumn: text("through_column"),
  activeToColumn: text("active_to_column"),
  roleCode: text("role_code").references(() => role.code),
  sort: integer("sort").notNull(),
})

export const skillTier = sqliteTable("skill_tier", {
  code: text("code").primaryKey(),
  nameEn: text("name_en").notNull(),
  names: text("names", { mode: "json" }).$type<Names>().notNull(),
  sort: integer("sort").notNull(),
})

export const userStatus = sqliteTable("user_status", {
  code: text("code").primaryKey(),
  nameEn: text("name_en").notNull(),
  names: text("names", { mode: "json" }).$type<Names>().notNull(),
  descriptionEn: text("description_en").notNull(),
  descriptions: text("descriptions", { mode: "json" }).$type<Names>().notNull(),
  sort: integer("sort").notNull(),
})

/**
 * Every vocabulary, keyed as the API exposes it.
 *
 * This is what lets /api/reference serve all of them without listing any: the
 * response schema and the handler's queries both derive from this map. Adding a
 * fixture upstream adds a key here and therefore a field on the endpoint, with
 * nothing else to edit.
 *
 * `satisfies` ties the key set to `VOCABULARY` in src/domain/vocabularies.ts —
 * the model-side map of the same vocabularies — in both directions: a key in
 * one and not the other is a compile error. The response schema used to be a
 * third copy of this list, typed out by hand, and it was one short:
 * `inviteStatuses` was read from D1 on every call and dropped by the contract,
 * with every gate green.
 */
export const VOCABULARY_TABLES = {
  inviteStatuses: inviteStatus,
  objectTypes: objectType,
  actions: action,
  ageGroups: ageGroup,
  provinces: province,
  cities: city,
  coachRoles: coachRole,
  eventFormats: eventFormat,
  eventTypes: eventType,
  gameStatuses: gameStatus,
  genders: gender,
  guardianTypes: guardianType,
  locales: locale,
  notificationCategories: notificationCategory,
  notificationChannels: notificationChannel,
  notificationTypes: notificationType,
  orgRoles: orgRole,
  orgTypes: orgType,
  positions: position,
  roles: role,
  relations: relation,
  skillTiers: skillTier,
  userStatuses: userStatus,
} as const satisfies Record<keyof typeof VOCABULARY, SQLiteTable>

const rowsOf = <T extends SQLiteTable>(table: T) => z.array(createSelectSchema(table))

/**
 * Each vocabulary's response schema, derived from its table — one per key of
 * VOCABULARY_TABLES, by construction.
 *
 * Built at runtime and typed by a mapped type over the same map, because
 * `Object.fromEntries` alone erases the key literals and the API would lose its
 * field types — the one thing this whole arrangement exists to keep. The cast
 * is honest: the value has exactly the keys the type names, since both come
 * from VOCABULARY_TABLES. (Typing the entries out by hand kept the literals
 * too, and that is the version that silently lost a vocabulary.)
 */
export const VOCABULARY_SCHEMAS = Object.fromEntries(
  Object.entries(VOCABULARY_TABLES).map(([key, table]) => [key, rowsOf(table)]),
) as unknown as {
  [K in keyof typeof VOCABULARY_TABLES]: ReturnType<typeof rowsOf<(typeof VOCABULARY_TABLES)[K]>>
}
