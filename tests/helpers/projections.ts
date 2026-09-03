/**
 * What the API answers for a seeded row, computed from the seed.
 *
 * The render tier has no backend by design, so every spec hands the query cache
 * a payload. Until now it *wrote* that payload: 128 literals across 18 files,
 * about seeded ids, checked against nothing. They drifted in the ordinary way.
 * `apiEvent()` claimed `playedCount: 17` for `evt_002` where the fixtures say
 * 21, and `event-sessions.spec.ts` called `evt_003` "Bangkok Skills Camp" when
 * the seed says "Chiang Mai Summer Basketball Camp 2026" — both typecheck,
 * because 17 is a number and a name is a string.
 *
 * These read `SEED_ENTITIES`/`SEED_RELATIONSHIPS` instead, so a render test
 * asserts what the reader would actually see. There is nowhere left to type the
 * wrong name.
 *
 * ## Half the job. The other half is tests/worker/projection-equivalence.test.ts
 *
 * A projection is a second implementation, and a second implementation drifts.
 * That objection is correct and this repo has already answered it once:
 * `authz-equivalence.test.ts` keeps the pre-refactor authorisation algorithm on
 * purpose, as an independent oracle, and asserts the two cannot disagree
 * anywhere the fixtures reach.
 *
 * Same here. Every function below is checked against the real procedure running
 * against a real seeded D1. **Do not change one of these without running that
 * test** — its whole value is that the shortcut cannot quietly stop matching.
 *
 * ## Facts derive; permissions are stated
 *
 * `canEdit`, `canDelete`, `canManage` are the *subject* of most render specs —
 * "offers the form to whoever may define the schedule, and to nobody else".
 * Deriving them would hide the thing under test, and would need the grant
 * resolver and therefore a database. They stay arguments the spec chooses, and
 * the equivalence test excludes them for the same reason.
 *
 * ## What does not belong here
 *
 * `standings.list` is not projectable and must not be added. It is an
 * aggregation over games plus a ranking rule with two tiebreaks, and a
 * projection of it would be a second implementation of the league table —
 * business logic rather than a row copy. A spec asking how the table *draws*
 * uses a literal; whether the numbers are right is a worker-tier question.
 * Likewise `me.mine` and `players.mine`, which resolve relations.
 */

import type { ApiEvent, ApiTeam } from "../../src/domain/api"
import { SEED_ENTITIES, SEED_RELATIONSHIPS } from "../../src/domain/model/entities"
import { clean } from "../../src/domain/names"
import type { Names } from "../../src/domain/names"
import type { ApiEntries, ApiGame, ApiRegistered, ApiRoster } from "./api-fixtures"

/**
 * The generator's fixed timestamp, as the API serializes it.
 *
 * `scripts/lib/seed.ts` writes every created_at and updated_at as this constant
 * so a seeded database is byte-identical between runs; the procedures call
 * `.toISOString()` on the way out.
 */
const AT = new Date(1_767_225_600_000).toISOString()

const E = SEED_ENTITIES
const R = SEED_RELATIONSHIPS

/**
 * The seed writes `names` through `clean()`, which orders the keys by LOCALES.
 * A projection that skipped it would produce the same name in a different key
 * order — equal by `toMatchObject`, unequal by `toEqual`, and only one of those
 * is the test anybody wants to debug.
 */
const names = (n: Names): Names => clean(n)

const eventById = (id: string) => E.events.find((e) => e.id === id)!
const teamById = (id: string) => E.teams.find((t) => t.id === id)!
const orgById = (id: string) => E.orgs.find((o) => o.id === id)!
const userById = (id: string) => E.users.find((u) => u.id === id)!
const venueById = (id: string) => E.venues.find((v) => v.id === id)!
const playerById = (id: string) => E.players.find((p) => p.id === id)!
const divisionById = (id: string) => E.divisions.find((d) => d.id === id)!

/** The English pivot the seed writes beside every `names` column. */
const pivotOf = (n: Names): string => n.en!

/**
 * What an event page can count without asking who is looking.
 *
 * Mirrors `factsFor` in src/api/events.ts, including the two rules that are easy
 * to miss: a team entered in two divisions is one team, and "played" means
 * FINISHED — a game in progress is not a result yet.
 */
function factsFor(eventId: string) {
  const entries = R.eventTeams.filter((t) => t.eventId === eventId)
  const teamCount = new Set(entries.map((t) => t.teamId)).size
  const divisionIds = [...new Set(entries.map((t) => t.divisionId))]
  const venues = R.eventVenues.filter((v) => v.eventId === eventId)
  // The primary one wins; otherwise the first seen, so a single unflagged venue
  // still names the place rather than reading "Venue TBC".
  const primary = venues.find((v) => v.isPrimary) ?? venues[0]
  const games = E.games.filter((g) => g.eventId === eventId)
  return {
    teamCount,
    divisionNames: divisionIds.map((id) => names(divisionById(id).names)),
    venueCount: venues.length,
    venueNames: primary ? names(venueById(primary.venueId).names) : null,
    followerCount: R.subscriptions.filter(
      (s) => s.objectTypeCode === "EVENT" && s.objectId === eventId,
    ).length,
    gameCount: games.length,
    playedCount: games.filter((g) => g.statusCode === "FINISHED").length,
  }
}

/** What the reader may do. Stated, never derived — see the note at the top. */
export interface EventRights {
  canEdit?: boolean
  canInviteCoOrganizer?: boolean
  canDelete?: boolean
}

/** One seeded event, as `events.get` returns it. */
export function projectEvent(id: string, rights: EventRights = {}): ApiEvent {
  const e = eventById(id)
  return {
    id: e.id,
    name: pivotOf(e.names),
    names: names(e.names),
    typeCode: e.typeCode,
    formatCode: e.formatCode,
    description: "description" in e ? (e.description as string) : null,
    startDate: e.startDate,
    endDate: e.endDate,
    cityCode: e.cityCode,
    provinceCode: e.provinceCode,
    isFibaCertified: e.isFibaCertified,
    timezone: e.timezone,
    orgId: e.orgId,
    organizerUserId: e.organizerUserId,
    organizerName: e.organizerUserId ? pivotOf(userById(e.organizerUserId).names) : null,
    createdAt: AT,
    updatedAt: AT,
    canEdit: rights.canEdit ?? false,
    canInviteCoOrganizer: rights.canInviteCoOrganizer ?? false,
    canDelete: rights.canDelete ?? false,
    ...factsFor(id),
  } as ApiEvent
}

/**
 * Every seeded event, in the order `events.list` returns them.
 *
 * Ordered by start date with nulls last, which is the endpoint's own
 * `sql\`start_date IS NULL\`, asc(start_date)`. A spec asserting "the soonest
 * one is first" is asserting that ordering, so getting it wrong here would make
 * the test agree with a page that is wrong.
 */
export function projectEvents(rights: Record<string, EventRights> = {}): ApiEvent[] {
  return E.events
    .map((e) => projectEvent(e.id, rights[e.id] ?? {}))
    .sort((a, b) => {
      if (!a.startDate) return b.startDate ? 1 : 0
      if (!b.startDate) return -1
      return a.startDate.localeCompare(b.startDate)
    })
}

/** One seeded team, as `teams.get` returns it — the school joined on. */
export function projectTeam(id: string, rights: { canEdit?: boolean } = {}): ApiTeam {
  const t = teamById(id)
  const org = t.orgId ? orgById(t.orgId) : null
  return {
    id: t.id,
    name: pivotOf(t.names),
    names: names(t.names),
    orgId: t.orgId,
    ageGroupCode: t.ageGroupCode,
    genderCode: t.genderCode,
    orgName: org ? pivotOf(org.names) : null,
    orgNames: org ? names(org.names) : null,
    orgCityCode: org?.cityCode ?? null,
    orgProvinceCode: org?.provinceCode ?? null,
    canEdit: rights.canEdit ?? false,
  } as ApiTeam
}

/** Every seeded team. */
export function projectTeams(rights: Record<string, { canEdit?: boolean }> = {}): ApiTeam[] {
  return E.teams.map((t) => projectTeam(t.id, rights[t.id] ?? {}))
}

export interface GameRights {
  canEnterScore?: boolean
  canSetStatus?: boolean
  canAssignReferee?: boolean
  canBroadcast?: boolean
}

/**
 * One seeded game, as `games.get` returns it.
 *
 * `isBroadcasting` is a fact about the game rather than about the reader — the
 * app owns it, because Cloudflare's relay cannot be asked — so it derives from
 * `gameBroadcasts` like any other row. `canBroadcast` is the reader's, and is
 * stated.
 */
export function projectGame(id: string, rights: GameRights = {}): ApiGame {
  const g = E.games.find((x) => x.id === id)!
  const event = eventById(g.eventId)
  return {
    id: g.id,
    eventId: g.eventId,
    homeTeamId: g.homeTeamId,
    awayTeamId: g.awayTeamId,
    homeTeamNames: names(teamById(g.homeTeamId).names),
    awayTeamNames: names(teamById(g.awayTeamId).names),
    venueId: g.venueId,
    venueNames: g.venueId ? names(venueById(g.venueId).names) : null,
    startsAt: g.startsAt,
    statusCode: g.statusCode,
    homeScore: g.homeScore,
    awayScore: g.awayScore,
    timezone: event.timezone,
    referees: R.gameReferees
      .filter((r) => r.gameId === id)
      .map((r) => ({ userId: r.userId, name: pivotOf(userById(r.userId).names) })),
    availableReferees: [],
    /**
     * A row is not a live broadcast; a *fresh* row is.
     *
     * `games.ts` treats a `gameBroadcast` as live only while its `lastSeenAt`
     * heartbeat is under BROADCAST_STALE_SECONDS (60) old, so **no seeded row
     * can ever be broadcasting** — any fixed timestamp is stale within a
     * minute of the seed being written.
     *
     * The seeded row is therefore the *stale* case, and that is a real state
     * worth having: a publisher crashed and left its row behind, and the game
     * correctly stops advertising itself. The live case belongs to a test that
     * writes a heartbeat, not to a fixture.
     */
    isBroadcasting: R.gameBroadcasts.some(
      (b) => b.gameId === id && b.lastSeenAt >= new Date(Date.now() - 60_000).toISOString(),
    ),
    canEnterScore: rights.canEnterScore ?? false,
    canSetStatus: rights.canSetStatus ?? false,
    canAssignReferee: rights.canAssignReferee ?? false,
    canBroadcast: rights.canBroadcast ?? false,
  } as ApiGame
}

/** Every game in one event, in the order the schedule shows them. */
export function projectGamesIn(
  eventId: string,
  rights: Record<string, GameRights> = {},
): ApiGame[] {
  return E.games
    .filter((g) => g.eventId === eventId)
    .map((g) => projectGame(g.id, rights[g.id] ?? {}))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
}

/**
 * A team's roster, as `teams.roster` returns it.
 *
 * Two rules that are not obvious and both come from the handler:
 *
 * A player who has left is off the roster, and "left" means `to_date` in the
 * past — a future end date is still a current player. That column was null in
 * all 120 rows until 2026-09-03, so this branch had never run against anything.
 *
 * **`coaches` is empty for a signed-out reader, on purpose.** `VIEW_TEAM` is
 * public and a roster of children is what a gym wall prints, but a coaching list
 * names the adults responsible for them. So it is a fact about the *reader*, not
 * about the team, and `signedIn` is how a spec says which case it is drawing.
 */
export function projectRoster(
  teamId: string,
  rights: { canManage?: boolean; signedIn?: boolean } = {},
): ApiRoster {
  const today = new Date().toISOString().slice(0, 10)
  const current = R.playerTeams.filter(
    (pt) => pt.teamId === teamId && (!pt.toDate || pt.toDate >= today),
  )
  return {
    players: current
      .map((pt) => {
        const p = playerById(pt.playerId)
        return {
          playerId: p.id,
          names: names(p.names),
          jerseyNumber: p.jerseyNumber,
          positionCode: p.positionCode,
          fromDate: pt.fromDate,
        }
      })
      .sort((a, b) => a.jerseyNumber - b.jerseyNumber),
    coaches: rights.signedIn
      ? R.teamCoaches
          .filter((c) => c.teamId === teamId)
          .map((c) => ({
            userId: c.userId,
            name: pivotOf(userById(c.userId).names),
            coachRoleCode: c.coachRoleCode,
          }))
      : [],
    available: [],
    canManage: rights.canManage ?? false,
  } as ApiRoster
}

/** One registered team, as `events.entries` returns it. */
function registered(eventId: string, teamId: string, canWithdraw: boolean): ApiRegistered {
  const entry = R.eventTeams.find((t) => t.eventId === eventId && t.teamId === teamId)!
  return {
    teamId,
    names: names(teamById(teamId).names),
    divisionId: entry.divisionId,
    divisionNames: names(divisionById(entry.divisionId).names),
    registeredAt: entry.registeredAt,
    canWithdraw,
  } as ApiRegistered
}

/** Who is entered in an event, and which divisions it runs. */
export function projectEntries(
  eventId: string,
  rights: { canManageFixtures?: boolean; canAssignCourts?: boolean; canWithdraw?: boolean } = {},
): ApiEntries {
  const entries = R.eventTeams.filter((t) => t.eventId === eventId)
  const divisionIds = [...new Set(entries.map((t) => t.divisionId))]
  return {
    registered: entries.map((t) => registered(eventId, t.teamId, rights.canWithdraw ?? false)),
    registrable: [],
    divisions: divisionIds.map((id) => {
      const d = divisionById(id)
      return {
        id,
        names: names(d.names),
        ageGroupCode: d.ageGroupCode,
        genderCode: d.genderCode,
      }
    }),
    canManageFixtures: rights.canManageFixtures ?? false,
    canAssignCourts: rights.canAssignCourts ?? false,
  } as ApiEntries
}

/** The camp's timetable, as `events.sessions` returns it. */
export function projectSessions(eventId: string, rights: { canDefine?: boolean } = {}) {
  const event = eventById(eventId)
  return {
    sessions: R.eventSessions
      .filter((s) => s.eventId === eventId)
      .map((s) => ({
        id: s.id,
        eventId: s.eventId,
        venueId: s.venueId,
        venueNames: s.venueId ? names(venueById(s.venueId).names) : null,
        names: names(s.names),
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        timezone: event.timezone,
      })),
    canDefine: rights.canDefine ?? false,
  }
}

/**
 * One session's register, as `events.attendance` returns it.
 *
 * Everyone entered in the event, ticked or not — a register listing only the
 * children who turned up is a list, and whoever is holding it needs to see who
 * is missing. `ply_006` misses two of the camp's five sessions, which is the
 * only reason the unticked branch has data at all.
 */
export function projectAttendance(
  eventId: string,
  sessionId: string,
  rights: { canRecord?: boolean } = {},
) {
  const present = new Set(
    R.sessionAttendances.filter((a) => a.sessionId === sessionId).map((a) => a.playerId),
  )
  return {
    players: R.eventPlayers
      .filter((e) => e.eventId === eventId)
      .map((e) => ({
        playerId: e.playerId,
        names: names(playerById(e.playerId).names),
        attended: present.has(e.playerId),
      })),
    canRecord: rights.canRecord ?? false,
  }
}

/** Every id the projections above can be asked about, for the equivalence test. */
export const SEEDED = {
  events: E.events.map((e) => e.id),
  teams: E.teams.map((t) => t.id),
  games: E.games.map((g) => g.id),
  sessions: R.eventSessions.map((s) => ({ id: s.id, eventId: s.eventId })),
} as const
