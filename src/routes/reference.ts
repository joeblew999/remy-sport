import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import { createSelectSchema } from "drizzle-zod"
import { drizzle } from "drizzle-orm/d1"
import { asc, eq } from "drizzle-orm"
import type { AppEnv } from "../types"
import * as schema from "../db/schema"

/**
 * The controlled vocabularies, served (ADR 015).
 *
 * Age groups, genders, org types, event types and formats, provinces. Every
 * one of these was previously hand-written in at least two places — a Zod enum
 * in a route file and, for anything user-facing, a label somewhere in the SPA.
 * Neither had the Thai names, so a bilingual product could only render codes.
 *
 * These schemas are **derived from the tables** with drizzle-zod rather than
 * written out again. That is the one place derivation genuinely pays here: the
 * response is exactly the table, so a column added to `age_group` cannot be
 * silently missing from the API. It is deliberately not used for the domain
 * routes, where the request shapes are not the table shapes — /api/teams
 * returns joined organisation columns and validates codes as enums that a TEXT
 * column cannot express.
 *
 * The one addition to the table shape is `names`: a locale-keyed map, joined
 * from `translation`. It is a map rather than `nameEn`/`nameTh` fields so that
 * shipping a third language adds a key to an object instead of a column to a
 * table, a field to a type, and a case to every consumer. `name_en` stays on
 * the row as the pivot — the guaranteed fallback and the province sort key.
 */

/** Display names, keyed by locale. A new language adds a key, not a field. */
const NamesSchema = z.record(z.string(), z.string()).openapi({
  description: "Display names keyed by locale code, one entry per supported locale",
  example: { en: "Under 16", th: "อายุไม่เกิน 16 ปี" },
})

const localized = <T extends z.ZodObject<z.ZodRawShape>>(table: T) =>
  table.extend({ names: NamesSchema })

const AgeGroupSchema = localized(createSelectSchema(schema.ageGroup))
const GenderSchema = localized(createSelectSchema(schema.gender))
const OrgTypeSchema = localized(createSelectSchema(schema.orgType))
const EventTypeSchema = localized(createSelectSchema(schema.eventType))
const EventFormatSchema = localized(createSelectSchema(schema.eventFormat))
const ProvinceSchema = localized(createSelectSchema(schema.province))
const CitySchema = localized(createSelectSchema(schema.city))

/** The whole payload, assembled from the per-table schemas above. */
const ReferenceSchema = z.object({
  locales: z.array(createSelectSchema(schema.locale)),
  ageGroups: z.array(AgeGroupSchema),
  genders: z.array(GenderSchema),
  orgTypes: z.array(OrgTypeSchema),
  eventTypes: z.array(EventTypeSchema),
  eventFormats: z.array(EventFormatSchema),
  provinces: z.array(ProvinceSchema),
  cities: z.array(CitySchema),
})

const reference = new OpenAPIHono<AppEnv>()

const listReferenceRoute = createRoute({
  method: "get",
  path: "/api/reference",
  responses: {
    200: {
      description: "Controlled vocabularies, as the Product Owner defines them",
      content: { "application/json": { schema: ReferenceSchema } },
    },
  },
})

type Row = { code: string }

/**
 * Attach each row's names from the translation catalogue.
 *
 * Falls back to the row's own `name_en` pivot if a term somehow has no rows —
 * the migration seeds every term in every locale, so this is belt-and-braces
 * rather than an expected path, but a vocabulary endpoint that can return a
 * nameless term is worse than one that repeats English.
 */
function withNames<T extends Row & { nameEn: string }>(
  rows: T[],
  table: string,
  byKey: Map<string, Record<string, string>>,
): Array<T & { names: Record<string, string> }> {
  return rows.map((row) => ({
    ...row,
    names: byKey.get(`${table}|${row.code}`) ?? { en: row.nameEn },
  }))
}

reference.openapi(listReferenceRoute, async (c) => {
  const db = drizzle(c.env.DB, { schema })

  // Ordered by `sort`, not by code: age order is not alphabetical order, and a
  // UI that lists U10, U12, U14, U16, U18, U21, OPEN, SENIOR is the point.
  const [locales, ageGroups, genders, orgTypes, eventTypes, eventFormats, provinces, cities, names] =
    await Promise.all([
      db.select().from(schema.locale).orderBy(asc(schema.locale.code)).all(),
      db.select().from(schema.ageGroup).orderBy(asc(schema.ageGroup.sort)).all(),
      db.select().from(schema.gender).orderBy(asc(schema.gender.sort)).all(),
      db.select().from(schema.orgType).orderBy(asc(schema.orgType.sort)).all(),
      db.select().from(schema.eventType).orderBy(asc(schema.eventType.sort)).all(),
      db.select().from(schema.eventFormat).orderBy(asc(schema.eventFormat.sort)).all(),
      db.select().from(schema.province).orderBy(asc(schema.province.nameEn)).all(),
      db.select().from(schema.city).orderBy(asc(schema.city.nameEn)).all(),
      // One query for every vocabulary's names, rather than one per table.
      db.select().from(schema.translation).where(eq(schema.translation.fieldName, "name")).all(),
    ])

  const byKey = new Map<string, Record<string, string>>()
  for (const t of names) {
    const key = `${t.tableName}|${t.recordKey}`
    const entry = byKey.get(key) ?? {}
    entry[t.localeCode] = t.value
    byKey.set(key, entry)
  }

  return c.json({
    locales,
    ageGroups: withNames(ageGroups, "age_group", byKey),
    genders: withNames(genders, "gender", byKey),
    orgTypes: withNames(orgTypes, "org_type", byKey),
    eventTypes: withNames(eventTypes, "event_type", byKey),
    eventFormats: withNames(eventFormats, "event_format", byKey),
    provinces: withNames(provinces, "province", byKey),
    cities: withNames(cities, "city", byKey),
  })
})

export default reference
