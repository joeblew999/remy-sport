/**
 * Facts about the seed, derived from the seed.
 *
 * Tests kept restating things the fixtures already say — "Wichai coaches
 * team_001 and team_004", "evt_002 has four teams" — as literals in an
 * assertion. That works until somebody extends the data, and then a test about
 * *withdrawal rights* fails because a league grew a fifth team. Five broke that
 * way on 2026-08-28, none of them for a reason connected to what they tested.
 *
 * The rule these restore: **assert the promise, derive the arithmetic.** A test
 * may absolutely name `team_001` when it is about team_001. What it should not
 * do is hardcode a list or a count that the fixtures compute — because then the
 * fixtures and the test are two sources for one fact, and the test is the stale
 * one.
 *
 * Everything here reads the same fixtures the database is seeded from, so these
 * cannot drift from what the API will answer.
 */

// Two exports, deliberately: SEED_ENTITIES is the things, SEED_RELATIONSHIPS
// is the links between them. Which one a table lives in is the model's answer,
// not a detail — `teams` is a thing, `teamCoaches` is a link.
import { SEED_ENTITIES, SEED_RELATIONSHIPS } from "../../src/domain/model/entities"

type Team = (typeof SEED_ENTITIES.teams)[number]
type Game = (typeof SEED_ENTITIES.games)[number]

/** The teams this person coaches, in whatever capacity. */
export const teamsCoachedBy = (userId: string): string[] =>
  SEED_RELATIONSHIPS.teamCoaches
    .filter((c) => c.userId === userId)
    .map((c) => c.teamId)
    .sort()

/** The teams entered in an event. */
export const teamsRegisteredTo = (eventId: string): string[] =>
  SEED_RELATIONSHIPS.eventTeams
    .filter((r) => r.eventId === eventId)
    .map((r) => r.teamId)
    .sort()

/** Every game this team plays, from either end of the fixture. */
export const gamesFor = (teamId: string): Game[] =>
  SEED_ENTITIES.games.filter((g) => g.homeTeamId === teamId || g.awayTeamId === teamId)

export const gamesIn = (eventId: string): Game[] =>
  SEED_ENTITIES.games.filter((g) => g.eventId === eventId)

export const teamById = (teamId: string): Team =>
  SEED_ENTITIES.teams.find((t) => t.id === teamId)!

/**
 * Two teams that could face each other — same age group, same gender.
 *
 * Fixtures across divisions are not a thing, so a test that needs "two teams"
 * needs two teams that could actually meet.
 */
export const aDivisionPair = (): [string, string] => {
  for (const a of SEED_ENTITIES.teams) {
    const b = SEED_ENTITIES.teams.find(
      (t) =>
        t.id !== a.id && t.ageGroupCode === a.ageGroupCode && t.genderCode === a.genderCode,
    )
    if (b) return [a.id, b.id]
  }
  throw new Error("the fixtures have no two teams in the same division")
}

/**
 * A team entered in `eventId` that has not played there.
 *
 * The case a standings table has to handle and the one that keeps disappearing
 * as the data grows: once every team has a season, nothing is left to prove
 * that the table is built from the entries rather than from the games.
 */
export const aTeamWithNoGamesIn = (eventId: string): string => {
  const played = new Set<string>(gamesIn(eventId).flatMap((g) => [g.homeTeamId, g.awayTeamId]))
  const idle = teamsRegisteredTo(eventId).find((t) => !played.has(t))
  if (!idle) {
    throw new Error(
      `every team in ${eventId} has played — the fixtures no longer cover ` +
        "the registered-but-unplayed case, which is the one this asserts",
    )
  }
  return idle
}

/** An id no fixture uses, for asserting that a filter is applied at all. */
export const NO_SUCH_TEAM = "team_not_in_the_fixtures"
