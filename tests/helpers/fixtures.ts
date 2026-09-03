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

/**
 * One team's record in one event, from the finished games only.
 *
 * The arithmetic a standings row states, derived rather than restated. Two tests
 * used to carry it as literals — `played: 1, won: 1, pointsFor: 68` — which was
 * true while `evt_001` had a single game and wrong the moment it had three.
 *
 * This is **not** a projection of the standings endpoint and must not become
 * one. It does not rank, and ranking is where the real logic lives: league
 * points, then point difference, then points scored, with the Product Owner's
 * `STANDINGS_POINTS` deciding the first. A test wanting to know the order asks
 * the API. A test wanting to know that a finished game counted for both sides,
 * and a scheduled one did not, asks this.
 */
export const recordIn = (
  eventId: string,
  teamId: string,
): { played: number; won: number; lost: number; pointsFor: number; pointsAgainst: number } => {
  const record = { played: 0, won: 0, lost: 0, pointsFor: 0, pointsAgainst: 0 }
  for (const g of gamesIn(eventId)) {
    if (g.statusCode !== "FINISHED" || g.homeScore === null || g.awayScore === null) continue
    const home = g.homeTeamId === teamId
    if (!home && g.awayTeamId !== teamId) continue
    const [mine, theirs] = home ? [g.homeScore, g.awayScore] : [g.awayScore, g.homeScore]
    record.played += 1
    record.pointsFor += mine
    record.pointsAgainst += theirs
    if (mine > theirs) record.won += 1
    else record.lost += 1
  }
  return record
}

/** The days an event's finished games were played on. */
const roundsIn = (eventId: string): Set<string> =>
  new Set(
    gamesIn(eventId)
      .filter((g) => g.statusCode === "FINISHED")
      .map((g) => g.startsAt.slice(0, 10)),
  )

/**
 * An event with only one round played, so a standings row cannot have moved.
 *
 * "Movement is null until there is something to compare against" was asserted
 * against `SEED_ENTITIES.events[0]` and a comment claiming the seed plays every
 * game of an event on one day. That was never true of the league — 17 finished
 * games on 17 days — it was only true of a tournament that had a single game.
 *
 * Both of these throw rather than returning undefined, so a fixture change that
 * removes the case fails loudly instead of leaving a test asserting nothing.
 */
export const anEventWithOneRound = (): string => {
  const found = SEED_ENTITIES.events.find(
    (e) => roundsIn(e.id).size < 2 && teamsRegisteredTo(e.id).length > 0,
  )
  if (!found) {
    throw new Error(
      "every seeded event has played more than one round — nothing covers the " +
        "case where movement must be null, which is the one that ships",
    )
  }
  return found.id
}

/** An event with more than one round, where movement is a real number. */
export const anEventWithSeveralRounds = (): string => {
  const found = SEED_ENTITIES.events.find((e) => roundsIn(e.id).size > 1)
  if (!found) {
    throw new Error("no seeded event has played two rounds — movement can never be non-null")
  }
  return found.id
}

/** An id no fixture uses, for asserting that a filter is applied at all. */
export const NO_SUCH_TEAM = "team_not_in_the_fixtures"
