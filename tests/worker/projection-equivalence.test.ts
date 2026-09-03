import { describe, expect, it } from "vitest"
import { actorFor, api, signIn } from "./helpers"
import {
  SEEDED,
  projectAttendance,
  projectEntries,
  projectEvent,
  projectEventVenues,
  projectEvents,
  projectVenues,
  projectGame,
  projectOrg,
  projectGamesIn,
  projectRoster,
  projectSessions,
  projectTeam,
  projectTeams,
} from "../helpers/projections"

/**
 * The render tier's shortcut answers exactly what the API answers.
 *
 * `tests/helpers/projections.ts` computes a procedure's response from the
 * fixtures, so a render spec can assert against real data with no backend. That
 * is a second implementation, and a second implementation drifts — which is the
 * whole reason this file exists.
 *
 * The prior art is `authz-equivalence.test.ts`, which keeps the pre-refactor
 * authorisation algorithm as an independent oracle for the same reason and says
 * plainly that it is allowed to rot: a failure means the two have genuinely
 * diverged and somebody has to say which is right.
 *
 * ## The oracle is the real procedure against a real database
 *
 * Not a fixture, not a snapshot. `api()` runs the Worker in-process against a D1
 * seeded from `seed.sql`, so what this compares against is what a browser would
 * receive. If a procedure grows a field, this fails and names it — instead of
 * 128 render assertions passing against a payload the API stopped returning.
 *
 * ## Anonymous, because permissions are not projected
 *
 * Every request here is unauthenticated, so every `can*` flag comes back false —
 * which is what the projections default to. That is not a gap being papered
 * over: those flags are the *subject* of most render specs ("offers the form to
 * whoever may define the schedule"), so deriving them would hide the thing under
 * test and would need the grant resolver. They stay stated, and this asserts
 * everything else.
 *
 * `availableReferees`, `available` (a roster's addable players) and `coaches`
 * are excluded for the same reason — all three are computed *for this reader*.
 * `coaches` is the interesting one: a roster of children is what a gym wall
 * prints, but the adults responsible for them are not public, so the endpoint
 * returns an empty list to a signed-out caller. The signed-in shape is asserted
 * separately at the end of this file.
 *
 * ## What is deliberately not here
 *
 * `standings.list`, `me.mine` and `players.mine`. The first is an aggregation
 * with a two-level tiebreak — projecting it would duplicate the league table,
 * which is business logic rather than a row copy. The other two resolve
 * relations, and duplicating `objectsHeldBy` would collide with the ownership
 * work. Nine of the render tier's 128 payloads stay hand-written, and that is a
 * decision rather than a remainder.
 */

/** Fields the server answers for a *reader*, which the projections do not model. */
const READER_SPECIFIC = ["availableReferees", "available", "coaches"] as const

/**
 * Lists the endpoint returns in no declared order.
 *
 * Four of them, found by this test rather than by reading: `divisionNames`,
 * `divisions`, `registered` and `coaches` all come out of a query with no ORDER BY, so
 * their order is SQLite's plan and nothing else. Asserting it would hold the API
 * to a promise it never made, and would fail on a future plan change for a
 * reason with nothing to do with the data.
 *
 * Compared as sets, then. **But a list of entered teams is something a screen
 * shows in an order**, and right now that order is luck — `games.list` and
 * `events.list` both sort explicitly and these do not. Worth an ORDER BY on the
 * endpoint; when it gets one, delete it from here and assert it instead.
 */
const UNORDERED = new Set(["divisionNames", "divisions", "registered"])

const sorted = (list: unknown[]) =>
  [...list].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))

const withoutReaderFields = <T>(value: T): T => {
  if (Array.isArray(value)) return value.map(withoutReaderFields) as T
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      if ((READER_SPECIFIC as readonly string[]).includes(k)) continue
      out[k] = UNORDERED.has(k) && Array.isArray(v)
        ? sorted(v.map(withoutReaderFields))
        : withoutReaderFields(v)
    }
    return out as T
  }
  return value
}

const get = async (path: string): Promise<unknown> => {
  const res = await api(path)
  expect(res.status, `${path} should be readable without a session`).toBe(200)
  return res.json()
}

/**
 * Equal, not merely compatible.
 *
 * `toMatchObject` would pass while the API returned a field the projection has
 * never heard of, which is the drift this is built to catch — a render spec
 * asserting against a payload three fields short of the real one is exactly how
 * `divisionNames`, `teamCount` and four others broke eleven tests at once.
 */
const same = (actual: unknown, projected: unknown, what: string) =>
  expect(withoutReaderFields(actual), what).toEqual(withoutReaderFields(projected))

describe("Events", () => {
  it.each(SEEDED.events)("%s is what the projection says", async (id) => {
    same(await get(`/api/events/${id}`), projectEvent(id), `events.get(${id})`)
  })

  it("lists them in the same order, with the same facts", async () => {
    const { events } = (await get("/api/events")) as { events: unknown[] }
    same(events, projectEvents(), "events.list")
  })
})

describe("Teams", () => {
  it.each(SEEDED.teams)("%s is what the projection says", async (id) => {
    same(await get(`/api/teams/${id}`), projectTeam(id), `teams.get(${id})`)
  })

  it("lists them with the school joined on", async () => {
    const { teams } = (await get("/api/teams")) as { teams: { id: string }[] }
    // The endpoint's order is its own; compare as a set keyed by id, because
    // ordering is a separate promise and asserting it here would make this fail
    // for a reason it does not test.
    const projected = new Map(projectTeams().map((t) => [t.id, t]))
    expect(teams.map((t) => t.id).sort()).toEqual([...projected.keys()].sort())
    for (const team of teams) same(team, projected.get(team.id), `teams.list[${team.id}]`)
  })

  it.each(SEEDED.teams)("%s's roster is what the projection says", async (id) => {
    same(await get(`/api/teams/${id}/players`), projectRoster(id), `teams.roster(${id})`)
  })
})

describe("Orgs", () => {
  it.each(SEEDED.orgs)("%s is what the projection says", async (id) => {
    same(await get(`/api/orgs/${id}`), projectOrg(id), `orgs.get(${id})`)
  })
})

describe("Venues", () => {
  it("are what the projection says", async () => {
    same(await get("/api/venues"), projectVenues(), "venues.list")
  })

  it("and which events use them", async () => {
    same(await get("/api/event-venues"), projectEventVenues(), "eventVenues.list")
  })
})

describe("Games", () => {
  it.each(SEEDED.games)("%s is what the projection says", async (id) => {
    same(await get(`/api/games/${id}`), projectGame(id), `games.get(${id})`)
  })

  it.each(SEEDED.events)("%s's schedule is what the projection says", async (eventId) => {
    const { games } = (await get(`/api/games?eventId=${eventId}`)) as { games: unknown[] }
    same(games, projectGamesIn(eventId), `games.list(${eventId})`)
  })
})

describe("Entries and sessions", () => {
  it.each(SEEDED.events)("%s's entries are what the projection says", async (eventId) => {
    same(await get(`/api/events/${eventId}/teams`), projectEntries(eventId), `entries(${eventId})`)
  })

  it.each(SEEDED.events)("%s's sessions are what the projection says", async (eventId) => {
    same(
      await get(`/api/events/${eventId}/sessions`),
      projectSessions(eventId),
      `sessions(${eventId})`,
    )
  })
})

/**
 * The one thing the anonymous pass cannot reach.
 *
 * `coaches` is empty for a signed-out reader by design, so every assertion above
 * proves only that the projection agrees about an empty list. This proves the
 * shape somebody actually sees — and it is the field with the worst history:
 * team coaching staff shipped, `teams.roster` grew the array, and every render
 * fixture kept seeding the older three-field shape while passing, because a
 * component reading `data.coaches` off a payload that has none renders an empty
 * list rather than throwing.
 */
describe("What only a signed-in reader sees", () => {
  /**
   * A register is not public. `RECORD_ATTENDANCE` gates writing it and the
   * endpoint refuses an anonymous reader outright — a list of which children
   * turned up where is not something a gym wall prints.
   *
   * Read here as a spectator, who may see it and may not mark it, so
   * `canRecord` comes back false and matches the projection's default.
   */
  it("a session's register is what the projection says", async () => {
    const cookie = await signIn(actorFor("SPECTATOR"))
    for (const { id, eventId } of SEEDED.sessions) {
      const res = await api(`/api/events/${eventId}/sessions/${id}/attendance`, { cookie })
      expect(res.status, `${id}'s register should be readable when signed in`).toBe(200)
      same(await res.json(), projectAttendance(eventId, id), `attendance(${id})`)
    }
  })

  it("is what the projection says, for every team", async () => {
    const cookie = await signIn(actorFor("SPECTATOR"))
    for (const id of SEEDED.teams) {
      const res = await api(`/api/teams/${id}/players`, { cookie })
      expect(res.status, `${id}'s roster should be readable`).toBe(200)
      const { coaches } = (await res.json()) as { coaches: unknown[] }
      // Unordered, like the other three — no ORDER BY on this query either.
      expect(sorted(coaches), `teams.roster(${id}).coaches`).toEqual(
        sorted(projectRoster(id, { signedIn: true }).coaches),
      )
    }
  })
})
