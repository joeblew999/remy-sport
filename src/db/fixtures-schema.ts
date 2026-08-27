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
// Tables for the domain model — entities and the links between them.

import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core"
import { createSelectSchema } from "drizzle-zod"
import type { Names } from "../domain/names"
import { INVITE_STATUS_CODES } from "../domain/vocabularies"
import { user, organization } from "./auth-schema"
import { event, team } from "./app-schema"
import { inviteStatus } from "./vocabularies-schema"
import { objectType } from "./vocabularies-schema"
import { action } from "./vocabularies-schema"
import { ageGroup } from "./vocabularies-schema"
import { province } from "./vocabularies-schema"
import { city } from "./vocabularies-schema"
import { coachRole } from "./vocabularies-schema"
import { eventFormat } from "./vocabularies-schema"
import { eventType } from "./vocabularies-schema"
import { gender } from "./vocabularies-schema"
import { guardianType } from "./vocabularies-schema"
import { locale } from "./vocabularies-schema"
import { notificationCategory } from "./vocabularies-schema"
import { notificationChannel } from "./vocabularies-schema"
import { notificationType } from "./vocabularies-schema"
import { orgRole } from "./vocabularies-schema"
import { orgType } from "./vocabularies-schema"
import { position } from "./vocabularies-schema"
import { role } from "./vocabularies-schema"
import { relation } from "./vocabularies-schema"
import { skillTier } from "./vocabularies-schema"
import { userStatus } from "./vocabularies-schema"

export const division = sqliteTable("division", {
  id: text("id").primaryKey(),
  ageGroupCode: text("age_group_code").notNull().references(() => ageGroup.code),
  genderCode: text("gender_code").notNull().references(() => gender.code),
  skillTierCode: text("skill_tier_code").references(() => skillTier.code),
  names: text("names", { mode: "json" }).$type<Names>().notNull(),
})

export const org = sqliteTable("org", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  orgTypeCode: text("org_type_code").notNull().references(() => orgType.code),
  cityCode: text("city_code").notNull().references(() => city.code),
  provinceCode: text("province_code").notNull().references(() => province.code),
  names: text("names", { mode: "json" }).$type<Names>().notNull(),
}, (t) => [uniqueIndex("org_key").on(t.id, t.slug)])

export const player = sqliteTable("player", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => user.id),
  jerseyNumber: integer("jersey_number").notNull(),
  positionCode: text("position_code").notNull().references(() => position.code),
  dob: text("dob").notNull(),
  names: text("names", { mode: "json" }).$type<Names>().notNull(),
})

export const venue = sqliteTable("venue", {
  id: text("id").primaryKey(),
  address: text("address").notNull(),
  cityCode: text("city_code").notNull().references(() => city.code),
  provinceCode: text("province_code").notNull().references(() => province.code),
  names: text("names", { mode: "json" }).$type<Names>().notNull(),
})

export const eventCoOrganizer = sqliteTable("eventCoOrganizer", {
  eventId: text("event_id").notNull().references(() => event.id),
  userId: text("user_id").notNull().references(() => user.id),
  addedAt: text("added_at").notNull(),
  // PENDING until they accept. The CO_ORGANIZER relation filters on ACCEPTED,
  // so an outstanding invitation grants nothing — which is what makes
  // ACCEPT_CO_ORGANIZER_INVITE an action rather than a formality.
  statusCode: text("status_code", { enum: INVITE_STATUS_CODES })
    .notNull()
    .references(() => inviteStatus.code),
}, (t) => [uniqueIndex("eventCoOrganizer_key").on(t.eventId, t.userId)])

export const eventPlayer = sqliteTable("eventPlayer", {
  eventId: text("event_id").notNull().references(() => event.id),
  playerId: text("player_id").notNull().references(() => player.id),
  registeredAt: text("registered_at").notNull(),
}, (t) => [uniqueIndex("eventPlayer_key").on(t.eventId, t.playerId)])

export const eventTeam = sqliteTable("eventTeam", {
  eventId: text("event_id").notNull().references(() => event.id),
  teamId: text("team_id").notNull().references(() => team.id),
  divisionId: text("division_id").notNull().references(() => division.id),
  registeredAt: text("registered_at").notNull(),
}, (t) => [uniqueIndex("eventTeam_key").on(t.eventId, t.teamId, t.divisionId)])

export const eventVenue = sqliteTable("eventVenue", {
  eventId: text("event_id").notNull().references(() => event.id),
  venueId: text("venue_id").notNull().references(() => venue.id),
  isPrimary: integer("is_primary", { mode: "boolean" }).notNull(),
}, (t) => [uniqueIndex("eventVenue_key").on(t.eventId, t.venueId)])

export const guardian = sqliteTable("guardian", {
  userId: text("user_id").notNull().references(() => user.id),
  playerId: text("player_id").notNull().references(() => player.id),
  guardianTypeCode: text("guardian_type_code").notNull().references(() => guardianType.code),
}, (t) => [uniqueIndex("guardian_key").on(t.userId, t.playerId)])

export const playerTeam = sqliteTable("playerTeam", {
  playerId: text("player_id").notNull().references(() => player.id),
  teamId: text("team_id").notNull().references(() => team.id),
  fromDate: text("from_date").notNull(),
  toDate: text("to_date"),
}, (t) => [uniqueIndex("playerTeam_key").on(t.playerId, t.teamId, t.fromDate)])

export const subscription = sqliteTable("subscription", {
  userId: text("user_id").notNull().references(() => user.id),
  objectTypeCode: text("object_type_code").notNull().references(() => objectType.code),
  objectId: text("object_id").notNull(),
  subscribedAt: text("subscribed_at").notNull(),
}, (t) => [uniqueIndex("subscription_key").on(t.userId, t.objectTypeCode, t.objectId)])

export const teamCoach = sqliteTable("teamCoach", {
  teamId: text("team_id").notNull().references(() => team.id),
  userId: text("user_id").notNull().references(() => user.id),
  coachRoleCode: text("coach_role_code").notNull().references(() => coachRole.code),
}, (t) => [uniqueIndex("teamCoach_key").on(t.teamId, t.userId)])

export const userNotificationChannel = sqliteTable("userNotificationChannel", {
  userId: text("user_id").notNull().references(() => user.id),
  channelCode: text("channel_code").notNull().references(() => notificationChannel.code),
  address: text("address").notNull(),
  addressLabel: text("address_label").notNull(),
  isEnabled: integer("is_enabled", { mode: "boolean" }).notNull(),
  verifiedAt: text("verified_at"),
}, (t) => [uniqueIndex("userNotificationChannel_key").on(t.userId, t.channelCode, t.addressLabel)])

export const userNotificationPreference = sqliteTable("userNotificationPreference", {
  userId: text("user_id").notNull().references(() => user.id),
  notificationTypeCode: text("notification_type_code").notNull().references(() => notificationType.code),
  channelCode: text("channel_code").notNull().references(() => notificationChannel.code),
  isEnabled: integer("is_enabled", { mode: "boolean" }).notNull(),
}, (t) => [uniqueIndex("userNotificationPreference_key").on(t.userId, t.notificationTypeCode, t.channelCode)])

/**
 * Every domain table, and its derived row schema.
 *
 * This is what lets a resource cost one line to expose instead of a route
 * block, a handler, a serialiser and a client type. src/domain/contract.ts
 * names which of these the API serves and at what access level — that part is
 * deliberately hand-written, because who may read a table is a decision, not a
 * mechanical consequence of the table existing.
 */
export const FIXTURE_TABLES = {
  divisions: division,
  orgs: org,
  players: player,
  venues: venue,
  eventCoOrganizers: eventCoOrganizer,
  eventPlayers: eventPlayer,
  eventTeams: eventTeam,
  eventVenues: eventVenue,
  guardians: guardian,
  playerTeams: playerTeam,
  subscriptions: subscription,
  teamCoaches: teamCoach,
  userNotificationChannels: userNotificationChannel,
  userNotificationPreferences: userNotificationPreference,
} as const

export const FIXTURE_SCHEMAS = {
  divisions: createSelectSchema(division),
  orgs: createSelectSchema(org),
  players: createSelectSchema(player),
  venues: createSelectSchema(venue),
  eventCoOrganizers: createSelectSchema(eventCoOrganizer),
  eventPlayers: createSelectSchema(eventPlayer),
  eventTeams: createSelectSchema(eventTeam),
  eventVenues: createSelectSchema(eventVenue),
  guardians: createSelectSchema(guardian),
  playerTeams: createSelectSchema(playerTeam),
  subscriptions: createSelectSchema(subscription),
  teamCoaches: createSelectSchema(teamCoach),
  userNotificationChannels: createSelectSchema(userNotificationChannel),
  userNotificationPreferences: createSelectSchema(userNotificationPreference),
} as const