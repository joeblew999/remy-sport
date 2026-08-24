import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi"
import { createSelectSchema } from "drizzle-zod"
import { drizzle } from "drizzle-orm/d1"
import { asc } from "drizzle-orm"
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
 */

const AgeGroupSchema = createSelectSchema(schema.ageGroup)
const GenderSchema = createSelectSchema(schema.gender)
const OrgTypeSchema = createSelectSchema(schema.orgType)
const EventTypeSchema = createSelectSchema(schema.eventType)
const EventFormatSchema = createSelectSchema(schema.eventFormat)
const ProvinceSchema = createSelectSchema(schema.province)

/** The whole payload, assembled from the per-table schemas above. */
const ReferenceSchema = z.object({
  ageGroups: z.array(AgeGroupSchema),
  genders: z.array(GenderSchema),
  orgTypes: z.array(OrgTypeSchema),
  eventTypes: z.array(EventTypeSchema),
  eventFormats: z.array(EventFormatSchema),
  provinces: z.array(ProvinceSchema),
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

reference.openapi(listReferenceRoute, async (c) => {
  const db = drizzle(c.env.DB, { schema })

  // Ordered by `sort`, not by code: age order is not alphabetical order, and a
  // UI that lists U10, U12, U14, U16, U18, U21, OPEN, SENIOR is the point.
  const [ageGroups, genders, orgTypes, eventTypes, eventFormats, provinces] = await Promise.all([
    db.select().from(schema.ageGroup).orderBy(asc(schema.ageGroup.sort)).all(),
    db.select().from(schema.gender).orderBy(asc(schema.gender.sort)).all(),
    db.select().from(schema.orgType).orderBy(asc(schema.orgType.sort)).all(),
    db.select().from(schema.eventType).orderBy(asc(schema.eventType.sort)).all(),
    db.select().from(schema.eventFormat).orderBy(asc(schema.eventFormat.sort)).all(),
    db.select().from(schema.province).orderBy(asc(schema.province.nameEn)).all(),
  ])

  return c.json({ ageGroups, genders, orgTypes, eventTypes, eventFormats, provinces })
})

export default reference
