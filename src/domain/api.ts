/**
 * The wire contract. One definition per shape, for the whole stack.
 *
 * Response schemas are DERIVED from the drizzle tables with drizzle-zod, so a
 * column added to `event` cannot be silently missing from the API. Request
 * schemas are hand-written on purpose: `createInsertSchema` on a TEXT column
 * yields `z.string()`, which would happily accept `"U99"` as an age group. The
 * database validates codes with foreign keys; the boundary validates them with
 * enums generated from the PO's fixtures. Derive what is safe to derive.
 *
 * These schemas are what oRPC publishes as OpenAPI and what the client infers
 * its types from, so there is no hand-written client interface anywhere.
 */

import { createSelectSchema } from "drizzle-zod"
import { z } from "zod"
import * as schema from "../db/schema"
import { VOCABULARY_SCHEMAS } from "../db/vocabularies-schema"
import {
  AGE_GROUP_CODES,
  GAME_STATUS_CODES,
  CITY_CODES,
  EVENT_FORMAT_CODES,
  EVENT_TYPE_CODES,
  GENDER_CODES,
  LOCALES,
} from "./vocabularies"

/**
 * Display names keyed by locale.
 *
 * partialRecord, not record: with an enum key `z.record` demands EVERY locale be
 * present, which would make an English-only name invalid.
 */
const NamesSchema = z
  .partialRecord(z.enum(LOCALES), z.string())
  .meta({ description: "Display names keyed by locale code", examples: [{ en: "Boys", th: "ชาย" }] })

/** At least one language must carry a name; which one is the caller's choice. */
const NamesInput = NamesSchema.refine((n) => Object.values(n).some((v) => v?.trim()), {
  message: "at least one locale must carry a name",
})

// ── Reference vocabularies ────────────────────────────────────────────────

/**
 * Every vocabulary, with no list of them here.
 *
 * `VOCABULARY_SCHEMAS` is generated from the fixtures, one derived schema per
 * table, so a vocabulary added upstream appears on this endpoint — typed,
 * translated, and in the OpenAPI document — with nothing edited here. `locales`
 * is among them: the fixtures define it like any other vocabulary.
 */
export const ReferenceSchema = z.object(VOCABULARY_SCHEMAS)

// ── Events ────────────────────────────────────────────────────────────────

const EventTypeSchema = z.enum(EVENT_TYPE_CODES)
const EventFormatSchema = z.enum(EVENT_FORMAT_CODES)

/** The biz schema stores dates as ISO 8601 day strings, not timestamps. */
const DaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")

export const EventSchema = createSelectSchema(schema.event)
  .omit({ createdAt: true, updatedAt: true })
  .extend({
    typeCode: EventTypeSchema,
    formatCode: EventFormatSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
    /**
     * Display label for "organised by". Canonical resolves this as
     * COALESCE(org.name, user.name); with no `orgs` table here it is the
     * organizer's user name, joined from created_by. Null if the user is gone.
     */
    organizerName: z.string().nullable(),
  })

export const CreateEventInput = z.object({
  names: NamesInput,
  typeCode: EventTypeSchema,
  formatCode: EventFormatSchema.optional(),
  description: z.string().optional(),
  startDate: DaySchema.optional(),
  endDate: DaySchema.optional(),
  cityCode: z.enum(CITY_CODES).optional(),
  provinceCode: z.string().optional(),
  isFibaCertified: z.boolean().optional(),
})

export const UpdateEventInput = CreateEventInput.partial()

// ── Teams ─────────────────────────────────────────────────────────────────

/**
 * An organisation — a school, club or federation.
 *
 * The domain's own table, not Better Auth's `organization`. Better Auth keeps
 * id, name and slug for its plugin; everything the Product Owner models about a
 * school is here, with `names` a real JSON column rather than a string.
 */
export const OrgSchema = createSelectSchema(schema.org)
export type ApiOrg = z.infer<typeof OrgSchema>

/** Only the profile is editable — the codes are the PO's vocabulary. */
export const UpdateOrgInput = z.object({
  names: z.record(z.string(), z.string()).optional(),
  cityCode: z.string().optional(),
  provinceCode: z.string().optional(),
})

export const TeamSchema = createSelectSchema(schema.team)
  .omit({ createdAt: true, updatedAt: true })
  .extend({
    ageGroupCode: z.enum(AGE_GROUP_CODES),
    genderCode: z.enum(GENDER_CODES),
    // Joined from `organization` — the team page shows the school, not an id.
    orgName: z.string().nullable(),
    orgNames: NamesSchema,
    orgCityCode: z.string().nullable(),
    orgProvinceCode: z.string().nullable(),
  })

export const CreateTeamInput = z.object({
  names: NamesInput,
  orgId: z.string().min(1),
  ageGroupCode: z.enum(AGE_GROUP_CODES),
  genderCode: z.enum(GENDER_CODES),
})

/**
 * Everything optional, but orgId is excluded entirely: moving a team between
 * schools is a transfer, not an edit, and would need membership of *both* orgs
 * to be checked. Out of scope until a transfer flow exists.
 */
export const UpdateTeamInput = CreateTeamInput.omit({ orgId: true }).partial()

/**
 * One game, with the names a schedule needs and the answer to "may I score it".
 *
 * `canEnterScore` is the server's answer, the same way `orgs.get` returns
 * `canEdit`: the page must not work it out from the viewer's role, because that
 * is a second copy of the access matrix. It is per row because the answer is per
 * row — a referee is assigned to one game and not the next, which is the whole
 * reason GAME exists as an object type.
 */
export const GameSchema = createSelectSchema(schema.game)
  .extend({
    statusCode: z.enum(GAME_STATUS_CODES),
    homeTeamNames: NamesSchema,
    awayTeamNames: NamesSchema,
    // Null until a court is assigned. The product renders "Venue TBC".
    venueNames: NamesSchema.nullable(),
    canEnterScore: z.boolean(),
    /**
     * A separate action in the model, and separate here. Today the same people
     * hold both, but `ENTER_SCORES` and `CONFIRM_MATCH_STATUS` are distinct
     * grants — deciding a game is over is not the same as writing what the score
     * was — and collapsing them here would be this file guessing that they stay
     * identical.
     */
    canSetStatus: z.boolean(),
    canAssignReferee: z.boolean(),
    /**
     * Who is officiating. Public, and deliberately: a referee's name on a
     * fixture is what makes an assignment accountable, and it is the visible
     * half of what stops anyone else entering the score.
     */
    referees: z.array(z.object({ userId: z.string(), name: z.string() })),
    availableReferees: z.array(z.object({ userId: z.string(), name: z.string() })),
  })

/**
 * Both scores or neither.
 *
 * A game with one score is not a partially-entered result, it is a wrong one —
 * and `homeScore` alone would read as a shutout. Clearing a mistaken entry is
 * `null` for both, which is why they are nullable rather than optional.
 */
export const EnterScoreInput = z.object({
  id: z.string(),
  homeScore: z.number().int().min(0).nullable(),
  awayScore: z.number().int().min(0).nullable(),
}).refine((v) => (v.homeScore === null) === (v.awayScore === null), {
  message: "Give both scores or neither",
})

export const SetGameStatusInput = z.object({
  id: z.string(),
  statusCode: z.enum(GAME_STATUS_CODES),
})

/**
 * One line of a league table. Every field is derived from the games — see
 * src/api/standings.ts for why none of it is stored.
 */
export const StandingsSchema = z.object({
  rank: z.number().int().min(1),
  teamId: z.string(),
  teamNames: NamesSchema,
  // Null where a team is registered without one; the table then reads as a
  // single group rather than inventing a division to file them under.
  divisionId: z.string().nullable(),
  divisionNames: NamesSchema.nullable(),
  played: z.number().int().min(0),
  won: z.number().int().min(0),
  lost: z.number().int().min(0),
  pointsFor: z.number().int().min(0),
  pointsAgainst: z.number().int().min(0),
  pointsDiff: z.number().int(),
  /** By the Product Owner's STANDINGS_POINTS — two for a win, today. */
  leaguePoints: z.number().int().min(0),
})

// ── Inferred types — what the client and the handlers both speak ──────────

export type ApiEvent = z.infer<typeof EventSchema>
export type ApiGame = z.infer<typeof GameSchema>
export type ApiTeam = z.infer<typeof TeamSchema>
export type ApiStandings = z.infer<typeof StandingsSchema>
export type ApiReference = z.infer<typeof ReferenceSchema>
