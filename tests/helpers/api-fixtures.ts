/**
 * API responses as the contract defines them, for tests that seed the cache.
 *
 * Every render spec used to write its own event literal and cast it with
 * `as never`, which is what the seed helper's typing exists to prevent and what
 * the cast silently reinstated. When the API grew `divisionNames`, `teamCount`
 * and four other fields, seven spec files kept compiling and eleven tests began
 * failing in a browser thirty seconds later — for a mismatch a type-checker
 * could have named instantly.
 *
 * These are typed as the real `ApiEvent` and `ApiTeam` **with no cast**, so the
 * next field added to the contract is a compile error here and nowhere else.
 *
 * The first version ended each literal with `as ApiEvent`, which suppresses
 * exactly the missing-property error the declared return type would have
 * raised — the file defeated its own purpose in its last two characters, while
 * the docstring claimed otherwise.
 *
 * The promise above was also unkept for a different reason: nothing compiled
 * this file until tests/ got a tsconfig, so `ApiEvent` could grow a field and
 * the fixture stay short of it. That is fixed; the drift it hid is what the
 * roster and game factories below exist to stop repeating.
 */

import type { RouterClient } from "@orpc/server"
import type { Router } from "../../src/api/index"
import type { ApiEvent } from "../../src/domain/api"
import { granted, platformGranted, type Held } from "./projections"

/**
 * The response type of one procedure, inferred rather than written out.
 *
 * `ApiEvent` and `ApiTeam` are exported from the domain because the SPA needs
 * them by name; most procedures are not, and hand-copying their shape into a
 * test helper would recreate the duplication this file exists to remove.
 */
type ResponseOf<P> = P extends (...a: never[]) => Promise<infer R> ? R : never
type Client = RouterClient<Router>

/**
 * One event, complete.
 *
 * The defaults describe a plausible league rather than an empty husk: a test
 * asserting "shows the number of teams" needs a number, and one asserting the
 * empty state should say so by overriding, not by relying on a fixture that
 * happens to be blank.
 */
export function apiEvent(over: Partial<ApiEvent> = {}): ApiEvent {
  return {
    id: "evt_002",
    name: "Bangkok Schools Basketball League 2026",
    names: {
      en: "Bangkok Schools Basketball League 2026",
      th: "ลีกบาสเกตบอลโรงเรียนกรุงเทพ",
    },
    typeCode: "LEAGUE",
    formatCode: "5x5",
    description: null,
    startDate: "2026-05-01",
    endDate: "2026-09-30",
    cityCode: "BANGKOK",
    provinceCode: "BKK",
    isFibaCertified: false,
    timezone: "Asia/Bangkok",
    orgId: null,
    organizerUserId: "usr_org_002",
    organizerName: "Niran",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    // A signed-in reader with no relation to it. Override with
    // `granted("EVENT", ["OWNER"], "LEAGUE")` to be somebody.
    can: granted("EVENT", [], "LEAGUE"),
    // Counted from event_teams, event_venues, games and subscriptions. These
    // were hardcoded zeroes in the client until 2026-08-29.
    teamCount: 15,
    venueCount: 1,
    followerCount: 2,
    gameCount: 28,
    playedCount: 17,
    venueNames: { en: "Assumption College Indoor Court" },
    divisionNames: [{ en: "U16 Boys" }, { en: "U16 Girls" }, { en: "U18 Boys" }],
    ...over,
  }
}


/**
 * One game, complete.
 *
 * `games.list` is seeded by the schedule, team and video specs, and each of
 * them wrote a partial literal: a fixture with `eventId`, `startsAt` and the
 * three permission flags, and none of `id`, `homeTeamId`, `awayTeamId`,
 * `statusCode`, `homeScore`, `awayScore` or the joined name maps. The component
 * reads several of those, so the tests were rendering against a payload the API
 * has never returned.
 */
export type ApiGame = ResponseOf<Client["games"]["get"]>

export function apiGame(over: Partial<ApiGame> = {}): ApiGame {
  return {
    id: "gam_002",
    eventId: "evt_002",
    homeTeamId: "team_001",
    awayTeamId: "team_002",
    homeTeamNames: { en: "Assumption U18 Boys" },
    awayTeamNames: { en: "Triam Udom U18 Girls" },
    // Null is a real state, not an empty one: a fixture exists before a court
    // is assigned, and the product renders "Venue TBC" for it.
    venueId: "ven_001",
    venueNames: { en: "Assumption College Indoor Court" },
    startsAt: "2026-06-10T09:00:00.000Z",
    statusCode: "SCHEDULED",
    homeScore: null,
    awayScore: null,
    timezone: "Asia/Bangkok",
    can: granted("GAME", [], "LEAGUE"),
    referees: [],
    availableReferees: [],
    // Live video. `isBroadcasting` is a fact about the game — the app owns it,
    // because Cloudflare's relay cannot be asked. Whether the reader may point
    // a camera at it is `can.BROADCAST_GAME`, the server's answer.
    isBroadcasting: false,
    ...over,
  }
}

/**
 * A team's roster: players, staff, and what the reader may do with them.
 *
 * `coaches` is the field that proves the point. Team coaching staff shipped
 * earlier in this session, `teams.roster` grew the array, and every render
 * fixture kept seeding the older three-field shape — passing, because the cast
 * meant nothing checked, and because a component reading `data.coaches` off a
 * payload that has none gets `undefined` and renders an empty list rather than
 * throwing. The tests said the squad page worked. They were not describing this
 * API.
 */
export type ApiRoster = ResponseOf<Client["teams"]["roster"]>

/**
 * One row of `players.list` — the whole table, so the whole row.
 *
 * No factory beside it on purpose. `domain.ts` derives that response straight
 * from the drizzle table, so a column the PO adds appears here without anything
 * being edited, and a fixture with defaults would be the place it silently
 * did not.
 */
export type ApiPlayerRow = ResponseOf<Client["players"]["list"]>["items"][number]


/** Same shape, without the `readonly` a generated `as const` carries. */
type DeepMutable<T> = T extends readonly (infer U)[]
  ? DeepMutable<U>[]
  : T extends object
    ? { -readonly [K in keyof T]: DeepMutable<T[K]> }
    : T

/**
 * The controlled vocabularies, as `reference.list` actually returns them.
 *
 * Not `VOCABULARY` itself, which is what the specs were seeding. That constant
 * is the *model's* shape — it carries `parentTypeCode` and `parentColumn` and
 * no `nameEn`, `descriptionEn` or `sort`. The endpoint selects from the
 * vocabulary *tables*, which are the model's fields plus those three. The two
 * are close enough to look interchangeable and are not, which is why the cast
 * hiding the difference survived so long.
 *
 * Derived rather than written out, so the PO adding a term to the model adds it
 * here too. `sort` follows array order, which is what the endpoint orders by and
 * what the model's own ordering means.
 */
/**
 * One vocabulary row as the table stores it.
 *
 * The model writes locale maps — `names`, `descriptions`, `fullNames` — and the
 * table stores an English column beside each of them: `nameEn`, `descriptionEn`,
 * `fullNameEn`. The rule is uniform (drop the plural, add `En`), so it is
 * expressed once rather than listed per vocabulary, and a fourth locale map
 * added to the model needs nothing here.
 */
type EnglishOf<K extends string> = K extends `${infer Base}s` ? `${Base}En` : never

type StoredTerm<T> = DeepMutable<T> & { sort: number } & {
  [K in Extract<keyof T, string> as EnglishOf<K>]: string
}

type StoredVocabularies<T> = {
  -readonly [K in keyof T]: T[K] extends readonly (infer U)[] ? StoredTerm<U>[] : never
}

export function apiReference<T extends Record<string, readonly Record<string, unknown>[]>>(
  vocabulary: T,
): StoredVocabularies<T> {
  const rows = (list: readonly Record<string, unknown>[]) =>
    list.map((term, i) => {
      const english: Record<string, string> = {}
      for (const [key, value] of Object.entries(term)) {
        // A locale map is the only thing with an `en`. `sort` follows array
        // order, which is what the endpoint orders by.
        if (key.endsWith("s") && value && typeof value === "object" && "en" in value) {
          english[`${key.slice(0, -1)}En`] = String((value as Record<string, string>).en ?? "")
        }
      }
      return { ...structuredClone(term), ...english, sort: i }
    })
  return Object.fromEntries(
    Object.entries(vocabulary).map(([key, list]) => [key, rows(list)]),
  ) as StoredVocabularies<T>
}

/** One standings row, complete. */
export type ApiStanding = ResponseOf<Client["standings"]["list"]>["standings"][number]

export function apiStanding(over: Partial<ApiStanding> = {}): ApiStanding {
  return {
    teamId: "team_001",
    teamNames: { en: "Assumption U16" },
    divisionId: "div_001",
    divisionNames: { en: "U16 Boys" },
    rank: 1,
    played: 1,
    won: 1,
    lost: 0,
    // Null rather than 0: before a second round there is nothing to compare
    // against, and "unchanged" would claim a comparison that has not happened.
    movement: null,
    pointsFor: 68,
    pointsAgainst: 54,
    pointsDiff: 14,
    leaguePoints: 2,
    ...over,
  }
}

/** What `events.entries` returns: who is in, who could be, and the divisions. */
export type ApiEntries = ResponseOf<Client["events"]["entries"]>

export function apiEntries(over: Partial<ApiEntries> = {}): ApiEntries {
  return {
    registered: [],
    registrable: [],
    // Not optional: `useEntries` maps it, so omitting it made the query throw
    // and the permission below silently read false.
    divisions: [],
    ...over,
  }
}

/**
 * One registered team, as `events.entries` returns it.
 *
 * The same reason `apiEntries` exists, one level down: these rows were built
 * inline at six call sites, so `registeredAt` broke all six and taught nothing.
 */
export type ApiRegistered = ApiEntries["registered"][number]

export function apiRegistered(over: Partial<ApiRegistered> = {}): ApiRegistered {
  return {
    teamId: "team_001",
    names: { en: "A Team" },
    divisionId: "div_001",
    divisionNames: { en: "U16 Boys" },
    registeredAt: "2026-03-12",
    can: { REGISTER_TEAM_FOR_EVENT: false },
    ...over,
  }
}

/**
 * What `me.mine` returns: what the reader holds, and the platform answers for
 * whoever the spec says they are — `apiMine([], ["ANY_ORGANIZER"])` may create
 * an event, `apiMine()` may not.
 */
export type ApiMine = ResponseOf<Client["me"]["mine"]>

export function apiMine(holdings: ApiMine["holdings"] = [], as: Held = []): ApiMine {
  return { holdings, can: platformGranted(as) }
}

/** One of the reader's own players, as `players.mine` returns them. */
export type ApiMyPlayer = ResponseOf<Client["players"]["mine"]>["players"][number]

