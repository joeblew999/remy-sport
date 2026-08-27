/**
 * The Product Owner's model, plus the three mappings this application owns.
 *
 * The model itself is copied verbatim from remy-sport-biz — see
 * scripts/domain-sync.ts. Re-exported from here so nothing downstream has to
 * know whether a name is the PO's or ours.
 *
 * What stays here is what is not the PO's business: which drizzle table a
 * fixture's rows live in, what Better Auth stores in `user.role`, and the map
 * /api/reference serves. Those describe this implementation, and putting them
 * upstream would be leaking the schema into the model.
 */
export * from "./model/vocabularies"
export type { Names } from "./model/names"

import {
  ACTION, AGE_GROUP, INVITE_STATUS, CITY, COACH_ROLE, EVENT_FORMAT, EVENT_TYPE, GENDER,
  GUARDIAN_TYPE, LOCALE, NOTIFICATION_CATEGORY, NOTIFICATION_CHANNEL,
  NOTIFICATION_TYPE, OBJECT_TYPE, ORG_ROLE, ORG_TYPE, POSITION, PROVINCE,
  RELATION, ROLE, SKILL_TIER, USER_STATUS,
} from "./model/vocabularies"

/**
 * A fixture's name, and the SQL table its rows live in.
 *
 * Authored, like the tables themselves. The relation resolver builds SQL from
 * the model's `sourceTable`, so these must be the names the database uses — not
 * the drizzle identifiers, which differ wherever a table is snake_case.
 *
 * `team_coaches` is `teamCoach`; `members` is Better Auth's `member`. The rule is
 * mechanical, which is exactly why it kept being re-implemented — this file, the
 * relation resolver and the alignment check each had their own copy, and two of
 * them silently did nothing when a caller compared a camelCase key against a
 * snake_case one. Derived once, here, where the fixture names are known.
 *
 * Covers every name a relation's `source_table` or an object type's `table_name`
 * can hold, including the tables Better Auth owns.
 */
export const FIXTURE_TABLE: Record<string, string> = {
  "divisions": "division",
  "event_co_organizers": "eventCoOrganizer",
  "event_players": "eventPlayer",
  "event_teams": "eventTeam",
  "event_venues": "eventVenue",
  "events": "event",
  "guardians": "guardian",
  "org_members": "org_member",
  "orgs": "org",
  "player_teams": "playerTeam",
  "players": "player",
  "subscriptions": "subscription",
  "team_coaches": "teamCoach",
  "teams": "team",
  "user_notification_channels": "userNotificationChannel",
  "user_notification_preferences": "userNotificationPreference",
  "users": "user",
  "venues": "venue",
}

/**
 * The platform role as the database stores it, per the PO's role code.
 *
 * The fixtures say `COACH`; the `user.role` column holds `coach`, because Better
 * Auth's admin plugin matches its own roles in lower case and everything else
 * followed. Eight places called `.toLowerCase()` themselves, which is eight
 * chances to compare the two forms and silently match nobody — and relations
 * fail closed, so that surfaces as an unexplained 403 rather than an error.
 */
/**
 * An organisation role as the membership table stores it.
 *
 * Better Auth owns that table and writes `owner`, `admin` and `member`; the
 * model says `OWNER`, `ADMIN`, `MEMBER`. Derived from the vocabulary rather than
 * typed out, so a role added upstream cannot be missed here — which is exactly
 * what happened when OWNER was absent and an organisation's own creator held no
 * relation to it.
 */
export const STORED_ORG_ROLE = Object.fromEntries(
  ORG_ROLE.map((r) => [r.code, r.code.toLowerCase()]),
) as Record<(typeof ORG_ROLE)[number]["code"], string>

export const STORED_ROLE = {
  ADMIN: "admin",
  ORGANIZER: "organizer",
  COACH: "coach",
  PLAYER: "player",
  SPECTATOR: "spectator",
  REFEREE: "referee",
} as const

export const VOCABULARY = {
  inviteStatuses: INVITE_STATUS,
  objectTypes: OBJECT_TYPE,
  actions: ACTION,
  ageGroups: AGE_GROUP,
  provinces: PROVINCE,
  cities: CITY,
  coachRoles: COACH_ROLE,
  eventFormats: EVENT_FORMAT,
  eventTypes: EVENT_TYPE,
  genders: GENDER,
  guardianTypes: GUARDIAN_TYPE,
  locales: LOCALE,
  notificationCategories: NOTIFICATION_CATEGORY,
  notificationChannels: NOTIFICATION_CHANNEL,
  notificationTypes: NOTIFICATION_TYPE,
  orgRoles: ORG_ROLE,
  orgTypes: ORG_TYPE,
  positions: POSITION,
  roles: ROLE,
  relations: RELATION,
  skillTiers: SKILL_TIER,
  userStatuses: USER_STATUS,
} as const
