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
import { relations } from "drizzle-orm"
import { createSelectSchema } from "drizzle-zod"
import type { Names } from "../domain/names"
import { GAME_STATUS_CODES, INVITE_STATUS_CODES, ORG_ROLE_CODES } from "../domain/vocabularies"
import { user } from "./auth-schema"
import { event, team } from "./app-schema"
import { inviteStatus } from "./vocabularies-schema"
import { gameStatus } from "./vocabularies-schema"
import { objectType } from "./vocabularies-schema"
import { ageGroup } from "./vocabularies-schema"
import { province } from "./vocabularies-schema"
import { city } from "./vocabularies-schema"
import { coachRole } from "./vocabularies-schema"
import { gender } from "./vocabularies-schema"
import { guardianType } from "./vocabularies-schema"
import { notificationChannel } from "./vocabularies-schema"
import { locale } from "./vocabularies-schema"
import { notificationType } from "./vocabularies-schema"
import { orgRole } from "./vocabularies-schema"
import { orgType } from "./vocabularies-schema"
import { position } from "./vocabularies-schema"
import { skillTier } from "./vocabularies-schema"

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

/**
 * Who may act for an organisation.
 *
 * Ours, not the authentication library's. Better Auth's organization plugin had
 * a `member` table and the ORG relations derived from it — which meant the
 * Product Owner's model reached into an implementation detail, and the app
 * needed a members-to-member table mapping and a role-casing mapping to read it.
 * Better Auth owns authentication; this is not that.
 */
export const orgMember = sqliteTable("org_member", {
  orgId: text("org_id").notNull().references(() => org.id),
  userId: text("user_id").notNull().references(() => user.id),
  orgRoleCode: text("org_role_code", { enum: ORG_ROLE_CODES })
    .notNull()
    .references(() => orgRole.code),
}, (t) => [uniqueIndex("org_member_key").on(t.orgId, t.userId)])

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

/**
 * One match inside an event — the noun the whole Scores, Standings and Live
 * half of the roadmap hangs off, and which the model had actions for but no
 * object type until 2026-08-27.
 *
 * `venueId` is nullable because the product already renders "Venue TBC" rather
 * than inventing one, and a fixture is often scheduled before a court is
 * assigned. The two scores are nullable for the same reason: a game that has
 * not been played has no score, and 0–0 is a result, not an absence.
 *
 * Per-quarter scoring is deliberately absent — the roadmap files it under
 * Future Ideas, and a box score is a separate table when it arrives, not four
 * more columns here.
 */
export const game = sqliteTable("game", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().references(() => event.id),
  homeTeamId: text("home_team_id").notNull().references(() => team.id),
  awayTeamId: text("away_team_id").notNull().references(() => team.id),
  venueId: text("venue_id").references(() => venue.id),
  // ISO 8601 datetime: a game has a kick-off time, where an event has only dates.
  startsAt: text("starts_at").notNull(),
  statusCode: text("status_code", { enum: GAME_STATUS_CODES })
    .notNull()
    .default("SCHEDULED")
    .references(() => gameStatus.code),
  homeScore: integer("home_score"),
  awayScore: integer("away_score"),
})

/**
 * Who is broadcasting this game right now.
 *
 * This table exists because the relay cannot answer the question. `@moq/net`
 * hardcodes `NO_DISCOVERY_HOSTS = ["mediaoverquic.com"]`, so
 * `connection.announced()` yields nothing on Cloudflare's relay — permanently,
 * by their design, because a consumer waiting on an announcement there would
 * hang forever. Without a record of our own, no page can say which games are
 * watchable and every viewer is sent to a black rectangle to find out.
 *
 * One row per game, so it also encodes Cloudflare's own rule: one publisher per
 * path. A second camera on the same game replaces the first rather than both
 * fighting over the relay's single slot.
 *
 * `lastSeenAt` is the part that makes it survivable. A publisher whose phone
 * dies never sends a stop, and a row that only had `startedAt` would advertise
 * that game as live forever. The client heartbeats; a row nobody has refreshed
 * is treated as gone.
 */
export const gameBroadcast = sqliteTable("gameBroadcast", {
  gameId: text("game_id").notNull().references(() => game.id),
  userId: text("user_id").notNull().references(() => user.id),
  startedAt: text("started_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
}, (t) => [uniqueIndex("gameBroadcast_key").on(t.gameId)])

/**
 * Which referees are on this game.
 *
 * The `GAME_REFEREE` relation reads exactly this. Before it existed,
 * `ENTER_SCORES` was granted to `ANY_REFEREE` — the platform role — so every
 * referee could score every game in every event.
 */
export const gameReferee = sqliteTable("gameReferee", {
  gameId: text("game_id").notNull().references(() => game.id),
  userId: text("user_id").notNull().references(() => user.id),
}, (t) => [uniqueIndex("gameReferee_key").on(t.gameId, t.userId)])

/**
 * Declared so a read can say `with: { homeTeam: true }` instead of three joins
 * and a hand-picked column list — the same reason app-schema declares them for
 * events and teams.
 */
export const gameRelations = relations(game, ({ one }) => ({
  event: one(event, { fields: [game.eventId], references: [event.id] }),
  homeTeam: one(team, { fields: [game.homeTeamId], references: [team.id] }),
  awayTeam: one(team, { fields: [game.awayTeamId], references: [team.id] }),
  venue: one(venue, { fields: [game.venueId], references: [venue.id] }),
}))

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

/**
 * Where one person can be reached on one channel.
 *
 * `address` is the address and nothing else: an email address, a phone number,
 * a LINE id — or, for PUSH, the endpoint URL a push service routes on. The
 * first version of Web Push stored the whole `PushSubscription` here as JSON,
 * which broke the one property that makes this table useful: the address is the
 * identity, and an identity buried inside a blob cannot be queried. Registering
 * a browser meant reading every row a user had and matching in JavaScript, and
 * so did unsubscribing.
 *
 * `channel_address` makes it an identity again. A push endpoint is unique to
 * one browser, so the index also states the rule that used to be hand-rolled:
 * one row per browser, no matter how often it re-subscribes.
 */
export const userNotificationChannel = sqliteTable("userNotificationChannel", {
  userId: text("user_id").notNull().references(() => user.id),
  channelCode: text("channel_code").notNull().references(() => notificationChannel.code),
  address: text("address").notNull(),
  addressLabel: text("address_label").notNull(),
  /**
   * Credentials for reaching that address, where the channel needs them.
   *
   * Null for email and SMS, which need nothing beyond the address. For PUSH it
   * is the subscription's `p256dh` and `auth` keys — the material the payload is
   * encrypted to. Separate from `address` because they are secret and it is not:
   * `address` is safe to show a reader in a list of their devices, and these
   * would let anyone holding them send to that browser.
   */
  secret: text("secret"),
  /**
   * Which language to write to this address in.
   *
   * Per address rather than per person on purpose: the same reader has a phone
   * in Thai and a laptop in English, and each one told us which when it
   * registered. Null means the product's base locale.
   */
  localeCode: text("locale_code").references(() => locale.code),
  isEnabled: integer("is_enabled", { mode: "boolean" }).notNull(),
  verifiedAt: text("verified_at"),
}, (t) => [
  uniqueIndex("userNotificationChannel_key").on(t.userId, t.channelCode, t.addressLabel),
  // One row per address per channel, across all users. A push endpoint belongs
  // to exactly one browser, so this is what makes `subscribe` an upsert instead
  // of a read-then-decide.
  uniqueIndex("userNotificationChannel_address").on(t.channelCode, t.address),
])

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
/** Standings read the registration to learn a team's division. */
export const eventTeamRelations = relations(eventTeam, ({ one }) => ({
  event: one(event, { fields: [eventTeam.eventId], references: [event.id] }),
  team: one(team, { fields: [eventTeam.teamId], references: [team.id] }),
  division: one(division, { fields: [eventTeam.divisionId], references: [division.id] }),
}))

export const FIXTURE_TABLES = {
  orgMembers: orgMember,
  divisions: division,
  orgs: org,
  players: player,
  venues: venue,
  games: game,
  gameReferees: gameReferee,
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
  orgMembers: createSelectSchema(orgMember),
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