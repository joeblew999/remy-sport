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
 * These are typed as the real `ApiEvent` and `ApiTeam` with no cast, so the next
 * field added to the contract is a compile error here and nowhere else.
 */

import type { ApiEvent, ApiTeam } from "../../src/domain/api"

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
  } as ApiEvent
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
  } as ApiTeam
}
