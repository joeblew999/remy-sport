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
import type { ApiEvent, ApiTeam } from "../../src/domain/api"

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
    canEdit: false,
    canInviteCoOrganizer: false,
    canDelete: false,
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

/** One team, complete. Same reasoning as `apiEvent`. */
export function apiTeam(over: Partial<ApiTeam> = {}): ApiTeam {
  return {
    id: "team_002",
    name: "Triam Udom U18 Girls",
    names: { en: "Triam Udom U18 Girls" },
    orgId: "org_002",
    ageGroupCode: "U18",
    genderCode: "F",
    orgName: "Triam Udom Suksa School",
    orgNames: { en: "Triam Udom Suksa School" },
    orgCityCode: "BANGKOK",
    orgProvinceCode: "BKK",
    canEdit: false,
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
    canEnterScore: false,
    canSetStatus: false,
    canAssignReferee: false,
    referees: [],
    availableReferees: [],
    // Live video. `isBroadcasting` is a fact about the game — the app owns it,
    // because Cloudflare's relay cannot be asked. `canBroadcast` is the
    // server's answer for this reader.
    isBroadcasting: false,
    canBroadcast: false,
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

export function apiRoster(over: Partial<ApiRoster> = {}): ApiRoster {
  return {
    players: [],
    coaches: [],
    // Who may change it — the server's answer, never derived in the page.
    canManage: false,
    // Players not on this team who could be added. Empty is the ordinary case
    // for a reader who may not manage the roster anyway.
    available: [],
    ...over,
  }
}
