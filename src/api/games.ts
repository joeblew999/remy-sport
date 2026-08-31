/**
 * Games — the fixtures inside an event, and their scores.
 *
 * The object type this whole half of the roadmap needed. The Product Owner's
 * model had `ENTER_SCORES`, `CONFIRM_MATCH_STATUS`, `VIEW_GAME_RESULTS` and
 * `VIEW_MATCH_STATUS` long before there was a game to hang them on, so they all
 * declared object type EVENT — and `ENTER_SCORES` was granted to `ANY_REFEREE`,
 * the *platform role*. Every referee could score every game in every event.
 *
 * Both writes are `requireAction`, so who may act is the model's answer:
 * `GAME_REFEREE` for the official on this game, and `GAME_EVENT_OWNER` /
 * `GAME_EVENT_CO_ORGANIZER` for whoever runs the event above it. Nothing in this
 * file decides any of that.
 *
 * Reading is public — `VIEW_GAME_RESULTS` is granted to `PUBLIC`. A spectator
 * looking up a score should not need an account.
 */

import { ORPCError } from "@orpc/server"
import { and, eq, gte, inArray } from "drizzle-orm"
import { z } from "zod"
import { track } from "../analytics"
import * as schema from "../db/schema"
import { EnterScoreInput, GameSchema, SetGameStatusInput, type ApiGame } from "../domain/api"
import { STORED_ROLE } from "../domain/vocabularies"
import { pick, type Names } from "../domain/names"
import { m } from "../paraglide/messages.js"
import { notify } from "./push"
import type { Bindings } from "../types"
import { ERRORS } from "./errors"
import { authed, authedRoute, canAll, found, openTo, requireAction, viewer, viewerTimezone, type Db, type SessionUser } from "./base"

const IdInput = z.object({ id: z.string() })

/**
 * How long a broadcast row is believed without a heartbeat.
 *
 * A publisher whose phone dies never sends a stop, and a row with only a start
 * time would advertise that game as live forever — worse than showing nothing,
 * because it sends viewers to a black rectangle and teaches them the feature is
 * broken. The client refreshes every 20 seconds; three missed refreshes and we
 * stop claiming it.
 */
const BROADCAST_STALE_SECONDS = 60

const freshSince = () => new Date(Date.now() - BROADCAST_STALE_SECONDS * 1000).toISOString()

type Row = typeof schema.game.$inferSelect & {
  homeTeam?: { names: Record<string, string> } | null
  awayTeam?: { names: Record<string, string> } | null
  venue?: { names: Record<string, string> } | null
  event?: { timezone: string | null } | null
}

const withNames = {
  homeTeam: { columns: { names: true } },
  awayTeam: { columns: { names: true } },
  venue: { columns: { names: true } },
  // The clock this game is played on. Per game rather than per response,
  // because `games.list` can span events and two of them can be in different
  // zones.
  event: { columns: { timezone: true } },
} as const

/**
 * One `can` per game, and that is the honest cost of a per-game permission.
 *
 * A schedule of three is six extra reads; a season of three hundred would not
 * be. When that day comes the fix is to answer it in one query — the relations
 * are all derivable in SQL — not to move the decision into the client.
 */
/**
 * The three things a game needs that are not on its own row, fetched for the
 * whole list at once.
 *
 * This was two queries *per game* inside `serialize` — the referee join and the
 * broadcast check — so one event's schedule of twenty-nine games made
 * fifty-eight round trips before any permission was resolved.
 *
 * Worth recording how that was found, because the first diagnosis was wrong.
 * The obvious suspect was the five `can()` calls per row, and removing one of
 * them moved 0.25s to 0.23s — eight per cent, when a fifth of the cost should
 * have moved a fifth. The measurement that settled it: an **anonymous** request
 * takes the same 0.24s, and for an anonymous caller every `can()` returns false
 * without touching a relation table. So `can()` was never the cost, and an hour
 * went into optimising it on an assertion nobody had tested.
 *
 * `availableReferees` is here too. It read every REFEREE user *per game* and
 * then filtered in memory — the same list, twenty-nine times.
 */
interface GameContext {
  /** gameId -> the officials on it. */
  referees: Map<string, { userId: string; name: string }[]>
  /** The games somebody is broadcasting right now. */
  broadcasting: Set<string>
  /** Every referee on the platform, read once. Empty when nobody may assign. */
  allReferees: { userId: string; name: string }[]
  /**
   * The four permissions, resolved for the whole list at once.
   *
   * These were four `can` calls *per game*, and every grant on them names a
   * `via: "parent"` relation — so each one hopped to the event and joined, and
   * each re-resolved the event subtype. A 28-game schedule cost around 700
   * reads and 246ms. `canAll` answers per relation instead of per row: about
   * six reads, whatever the length.
   */
  mayEnterScore: Set<string>
  maySetStatus: Set<string>
  mayAssignReferee: Set<string>
  mayBroadcast: Set<string>
}

const NO_CONTEXT: GameContext = {
  referees: new Map(),
  broadcasting: new Set(),
  allReferees: [],
  mayEnterScore: new Set(),
  maySetStatus: new Set(),
  mayAssignReferee: new Set(),
  mayBroadcast: new Set(),
}

async function contextFor(
  db: Db,
  gameIds: string[],
  user: SessionUser | null,
): Promise<GameContext> {
  if (gameIds.length === 0) return NO_CONTEXT

  // Every permission for every game, four queries' worth rather than four per
  // row. Asked before the rest because `allReferees` depends on the answer.
  const [mayEnterScore, maySetStatus, mayAssignReferee, mayBroadcast] = await Promise.all([
    canAll(db, "ENTER_SCORES", user, gameIds),
    canAll(db, "CONFIRM_MATCH_STATUS", user, gameIds),
    canAll(db, "ASSIGN_REFEREE", user, gameIds),
    canAll(db, "BROADCAST_GAME", user, gameIds),
  ])
  const anyAssign = mayAssignReferee.size > 0

  const [refs, live, all] = await Promise.all([
    db
      .select({
        gameId: schema.gameReferee.gameId,
        userId: schema.gameReferee.userId,
        name: schema.user.name,
      })
      .from(schema.gameReferee)
      .innerJoin(schema.user, eq(schema.user.id, schema.gameReferee.userId))
      .where(inArray(schema.gameReferee.gameId, gameIds))
      .all(),
    db
      .select({ gameId: schema.gameBroadcast.gameId })
      .from(schema.gameBroadcast)
      .where(
        and(
          inArray(schema.gameBroadcast.gameId, gameIds),
          gte(schema.gameBroadcast.lastSeenAt, freshSince()),
        ),
      )
      .all(),
    // Only for somebody who may assign one. A global "list every referee" read
    // is a directory of people; this stays scoped to the decision it serves.
    anyAssign
      ? db
          .select({ userId: schema.user.id, name: schema.user.name })
          .from(schema.user)
          .where(eq(schema.user.role, STORED_ROLE.REFEREE))
          .all()
      : Promise.resolve([]),
  ])

  const referees = new Map<string, { userId: string; name: string }[]>()
  for (const r of refs) {
    const list = referees.get(r.gameId)
    if (list) list.push({ userId: r.userId, name: r.name })
    else referees.set(r.gameId, [{ userId: r.userId, name: r.name }])
  }

  return {
    referees,
    broadcasting: new Set(live.map((l) => l.gameId)),
    allReferees: all,
    mayEnterScore,
    maySetStatus,
    mayAssignReferee,
    mayBroadcast,
  }
}

/**
 * Synchronous now, because every question it used to ask has been answered.
 *
 * It made four `can` calls per row; the context carries all four as sets. A
 * function that reads a prepared answer cannot accidentally reintroduce a query
 * per row, which is what this was.
 */
function serialize(row: Row, ctx: GameContext = NO_CONTEXT): ApiGame {
  const { homeTeam, awayTeam, venue, event, ...rest } = row
  const assign = ctx.mayAssignReferee.has(row.id)
  const onThisGame = ctx.referees.get(row.id) ?? []
  return {
    ...rest,
    homeTeamNames: homeTeam?.names ?? {},
    awayTeamNames: awayTeam?.names ?? {},
    venueNames: venue?.names ?? null,
    timezone: event?.timezone ?? null,
    canEnterScore: ctx.mayEnterScore.has(row.id),
    canSetStatus: ctx.maySetStatus.has(row.id),
    canAssignReferee: assign,
    // From our table, refreshed by the publisher's heartbeat — see
    // BROADCAST_STALE_SECONDS. A row nobody has touched is not a live game.
    isBroadcasting: ctx.broadcasting.has(row.id),
    canBroadcast: ctx.mayBroadcast.has(row.id),
    /**
     * Referees not already on this game, and only for someone who may assign
     * one — a global list would be a directory of people.
     */
    availableReferees: assign
      ? ctx.allReferees.filter((c) => !onThisGame.some((r) => r.userId === c.userId))
      : [],
    referees: onThisGame,
  }
}

/** One game, with its context fetched for a list of one. */
async function serializeOne(db: Db, user: SessionUser | null, row: Row): Promise<ApiGame> {
  return serialize(row, await contextFor(db, [row.id], user))
}

export const list = viewer
  .use(openTo("VIEW_FIXTURE_SCHEDULE"))
  .route({ method: "GET", path: "/games", summary: "List games, optionally for one event" })
  .input(z.object({ eventId: z.string().optional(), teamId: z.string().optional() }))
  .output(z.object({ games: z.array(GameSchema), viewerTimezone: z.string().nullable() }))
  .handler(async ({ context, input }) => {
    const rows = await context.db.query.game.findMany({
      // `teamId` matches either side, because a team's season is its games and
      // a team does not care which end of the fixture it was written on. Added
      // for the team page, which showed seven invented games until 2026-08-28.
      where: (g, { eq: is, or: either, and: both }) => {
        const byEvent = input.eventId ? is(g.eventId, input.eventId) : undefined
        const byTeam = input.teamId
          ? either(is(g.homeTeamId, input.teamId), is(g.awayTeamId, input.teamId))
          : undefined
        return byEvent && byTeam ? both(byEvent, byTeam) : (byEvent ?? byTeam)
      },
      with: withNames,
      // Chronological: a schedule reads forwards, and a finished game keeps its
      // place rather than sorting to the bottom.
      orderBy: (g, { asc }) => [asc(g.startsAt)],
    })
    return {
      // One context for the whole list, not two queries per row.
      games: await (async () => {
        // One context for the whole list, permissions included. The previous
        // version asked ASSIGN_REFEREE about `ids[0]` and applied the answer to
        // every row — right for an organiser, wrong for a referee assigned to
        // one game in the list.
        const ctx = await contextFor(context.db, rows.map((r) => r.id), context.user)
        return rows.map((r) => serialize(r, ctx))
      })(),
      // Resolved at the edge, so a page can show "18:00 your time" without
      // asking the browser and without a library. Null under wrangler dev and
      // in tests, which the page treats as "show the venue clock alone".
      viewerTimezone: viewerTimezone(context.request),
    }
  })

export const get = viewer
  .use(openTo("VIEW_GAME_RESULTS"))
  .route({ method: "GET", path: "/games/{id}", summary: "Get one game" })
  .input(IdInput)
  .output(GameSchema)
  .handler(async ({ context, input }) => {
    const row = found(
      await context.db.query.game.findFirst({
        where: (g, { eq: is }) => is(g.id, input.id),
        with: withNames,
      }),
    )
    return serializeOne(context.db, context.user, row)
  })

/**
 * The score.
 *
 * Writing one does not change the status: a score can be entered at half-time
 * and corrected after the final whistle, and deciding a game is over is
 * `CONFIRM_MATCH_STATUS` — a separate action in the model, held by the same
 * people but meaning something different.
 */
export const enterScore = authed
  .route({ method: "PUT", path: "/games/{id}/score", summary: "Enter or correct a game's score", ...authedRoute })
  .input(EnterScoreInput)
  .output(GameSchema)
  .use(requireAction("ENTER_SCORES"))
  .handler(async ({ context, input }) => {
    await context.db
      .update(schema.game)
      .set({ homeScore: input.homeScore, awayScore: input.awayScore })
      .where(eq(schema.game.id, input.id))

    // Only while the game is actually being played. A score corrected days
    // later is a records fix, and waking a phone at midnight for it would teach
    // people to switch notifications off — which costs us the live ones too.
    const fresh = await reload(context.db, context.user, input.id)
    if (fresh.statusCode === "LIVE") {
      await announce(context.db, context.env, "SCORE_UPDATE", input.id, context.user.id)
    }
    return fresh
  })

export const setStatus = authed
  .route({ method: "PUT", path: "/games/{id}/status", summary: "Mark a game live, at half-time or finished", ...authedRoute })
  .input(SetGameStatusInput)
  .output(GameSchema)
  .use(requireAction("CONFIRM_MATCH_STATUS"))
  .handler(async ({ context, input }) => {
    await context.db
      .update(schema.game)
      .set({ statusCode: input.statusCode })
      .where(eq(schema.game.id, input.id))

    // Tip-off and the final whistle. HALFTIME is deliberately silent: it is not
    // news, and it would land between the two that are.
    const announcement =
      input.statusCode === "LIVE"
        ? "MATCH_START"
        : input.statusCode === "FINISHED"
          ? "MATCH_END"
          : null
    if (announcement) {
      await announce(context.db, context.env, announcement, input.id, context.user.id)
    }
    return reload(context.db, context.user, input.id)
  })

/**
 * Tell everyone following this game — or either team, or the event — what just
 * happened.
 *
 * Four targets for one game, because "follow" means different things to
 * different people: a parent follows the team, a spectator follows the game,
 * and an organiser follows the event. `notify` de-duplicates by user, so
 * someone following both the team and the event is woken once.
 *
 * Awaited rather than fired into `waitUntil`. It is one D1 read and a fetch per
 * device, and a score entered courtside must not report success before it has
 * gone out — a referee who sees "saved" and then finds nobody was told has no
 * way to retry. `notify` swallows its own failures, so this cannot fail the
 * write it follows.
 */
async function announce(
  db: Db,
  env: Bindings,
  typeCode: "MATCH_START" | "MATCH_END" | "SCORE_UPDATE",
  gameId: string,
  actorId: string,
): Promise<void> {
  const row = await db.query.game.findFirst({
    where: (g, { eq: is }) => is(g.id, gameId),
    with: {
      homeTeam: { columns: { names: true } },
      awayTeam: { columns: { names: true } },
      event: { columns: { id: true, names: true } },
    },
  })
  if (!row) return

  const game = row as typeof row & {
    homeTeam?: { names: Names } | null
    awayTeam?: { names: Names } | null
    event?: { id: string; names: Names } | null
  }

  const args = {
    homeScore: String(game.homeScore ?? 0),
    awayScore: String(game.awayScore ?? 0),
  }

  await notify(db, env, {
    typeCode,
    targets: [
      { objectTypeCode: "GAME", objectId: gameId },
      ...(game.eventId ? [{ objectTypeCode: "EVENT" as const, objectId: game.eventId }] : []),
      ...(game.homeTeamId ? [{ objectTypeCode: "TEAM" as const, objectId: game.homeTeamId }] : []),
      ...(game.awayTeamId ? [{ objectTypeCode: "TEAM" as const, objectId: game.awayTeamId }] : []),
    ],
    // One tag per game, not per event: a live score replaces the previous score
    // for the same game and stacks against a different one. Includes the type
    // so the final whistle does not silently overwrite itself onto a
    // mid-quarter update the reader has not looked at yet.
    tag: `${typeCode === "SCORE_UPDATE" ? "score" : "status"}:${gameId}`,
    exclude: actorId,
    render: (locale) => {
      const home = pick(game.homeTeam?.names, locale)
      const away = pick(game.awayTeam?.names, locale)
      const event = pick(game.event?.names, locale)
      const url = `#/games/${gameId}`
      if (typeCode === "MATCH_START") {
        return {
          title: m.push_match_start_title({ home, away }, { locale }),
          body: m.push_match_start_body({ event }, { locale }),
          url,
        }
      }
      if (typeCode === "MATCH_END") {
        return {
          title: m.push_match_end_title({ home, away, ...args }, { locale }),
          body: m.push_match_end_body({ event }, { locale }),
          url,
        }
      }
      return {
        title: m.push_score_title({ home, away, ...args }, { locale }),
        body: m.push_score_body({ event }, { locale }),
        url,
      }
    },
  })
}

/** Read back what was written, so the client never guesses the new row. */
async function reload(db: Db, user: SessionUser, id: string): Promise<ApiGame> {
  const row = found(
    await db.query.game.findFirst({ where: (g, { eq: is }) => is(g.id, id), with: withNames }),
  )
  return serializeOne(db, user, row)
}

/**
 * Creating and changing a fixture.
 *
 * `MANAGE_FIXTURES` is EVENT-scoped, because a game that does not exist yet has
 * no relation to be in — the same reason `CREATE_TEAM` is a platform action.
 * Editing and deleting are scoped that way too rather than to the game, so all
 * three ask one question of one object: do you run this event.
 *
 * There was no way to create a game at all until 2026-08-27. An organiser could
 * create an event and register teams, then schedule nothing — the loop was
 * broken in the middle, and the only games that existed came from the seed.
 */
/**
 * The divisions each team is entered in, for this event.
 *
 * A team can hold more than one — `eventTeam` is keyed on
 * (event, team, division) — so "same division" is a non-empty intersection
 * rather than an equality. A club fielding one squad in two age groups is the
 * case that makes the difference.
 */
async function divisionsOf(
  db: Db,
  eventId: string,
  teamIds: string[],
): Promise<Map<string, string[]>> {
  const rows = await db
    .select({ teamId: schema.eventTeam.teamId, divisionId: schema.eventTeam.divisionId })
    .from(schema.eventTeam)
    .where(
      and(eq(schema.eventTeam.eventId, eventId), inArray(schema.eventTeam.teamId, teamIds)),
    )
    .all()
  const out = new Map<string, string[]>(teamIds.map((id) => [id, []]))
  for (const r of rows) out.get(r.teamId)?.push(r.divisionId)
  return out
}

/**
 * Refuse a pairing whose teams share no division.
 *
 * Nothing checked this until 2026-08-31. `create` verified that a team was not
 * playing itself and that both were entered, and a U16 boys' team could be
 * scheduled against a U18 girls' team in a league organised entirely by
 * division — confirmed against a running server, which answered 201.
 *
 * The model had every other piece: `eventTeam` is keyed by division, and
 * registration already refuses a team whose age group or gender does not match
 * the division it enters. Only the fixture was unguarded.
 */
async function assertSameDivision(
  db: Db,
  eventId: string,
  homeTeamId: string,
  awayTeamId: string,
  fail: (opts: { data: { homeDivisions: string[]; awayDivisions: string[] } }) => Error,
): Promise<void> {
  const divisions = await divisionsOf(db, eventId, [homeTeamId, awayTeamId])
  const home = divisions.get(homeTeamId) ?? []
  const away = divisions.get(awayTeamId) ?? []
  if (home.some((d) => away.includes(d))) return
  throw fail({ data: { homeDivisions: home, awayDivisions: away } })
}

const FixtureInput = z.object({
  eventId: z.string(),
  homeTeamId: z.string(),
  awayTeamId: z.string(),
  venueId: z.string().nullable().optional(),
  startsAt: z.string(),
})

export const create = authed
  .route({ method: "POST", path: "/events/{eventId}/games", summary: "Add a fixture", successStatus: 201, ...authedRoute })
  // Codes and facts, not prose — the sentence is rendered in the reader's
  // language client-side. See src/api/errors.ts.
  .errors({
    TEAM_PLAYS_ITSELF: ERRORS.TEAM_PLAYS_ITSELF,
    TEAM_NOT_ENTERED: ERRORS.TEAM_NOT_ENTERED,
    TEAMS_IN_DIFFERENT_DIVISIONS: ERRORS.TEAMS_IN_DIFFERENT_DIVISIONS,
  })
  .input(FixtureInput)
  .output(GameSchema)
  .use(requireAction("MANAGE_FIXTURES", (i: { eventId: string }) => i.eventId))
  .handler(async ({ context, input, errors }) => {
    if (input.homeTeamId === input.awayTeamId) throw errors.TEAM_PLAYS_ITSELF()

    /**
     * Both teams must be in this event.
     *
     * The foreign keys prove the teams exist; nothing stops a fixture between
     * two teams that never entered. That would appear in the schedule and, once
     * played, in a standings table they are not part of.
     */
    const entered = await context.db
      .select({ teamId: schema.eventTeam.teamId })
      .from(schema.eventTeam)
      .where(eq(schema.eventTeam.eventId, input.eventId))
      .all()
    const ids = new Set(entered.map((e) => e.teamId))
    for (const teamId of [input.homeTeamId, input.awayTeamId]) {
      if (!ids.has(teamId)) throw errors.TEAM_NOT_ENTERED({ data: { teamId } })
    }

    // After "entered", because a team in no division of this event is not
    // entered at all and that is the more useful thing to be told.
    await assertSameDivision(
      context.db,
      input.eventId,
      input.homeTeamId,
      input.awayTeamId,
      errors.TEAMS_IN_DIFFERENT_DIVISIONS,
    )

    // Readable and sortable, and unique per event without a counter table.
    const id = `gam_${crypto.randomUUID().slice(0, 8)}`
    await context.db.insert(schema.game).values({
      id,
      eventId: input.eventId,
      homeTeamId: input.homeTeamId,
      awayTeamId: input.awayTeamId,
      venueId: input.venueId ?? null,
      startsAt: input.startsAt,
      statusCode: "SCHEDULED",
    })
    return reload(context.db, context.user, id)
  })

/**
 * Every unordered pairing, in rounds where nobody plays twice.
 *
 * The circle method: fix one team, rotate the rest. It matters that this yields
 * *rounds* rather than a flat list of pairs — a league plays a matchday at a
 * time, and a schedule that put a team in three games on one date would be a
 * list of fixtures rather than a schedule.
 *
 * An odd count gets a bye, which is the standing team sitting that round out.
 */
function roundRobin(teamIds: string[]): [string, string][][] {
  if (teamIds.length < 2) return []
  const teams = [...teamIds]
  // A phantom opponent, so an odd division still pairs cleanly. Whoever draws
  // it has a bye that round and no fixture is emitted.
  const bye = "__bye__"
  if (teams.length % 2 === 1) teams.push(bye)

  const rounds: [string, string][][] = []
  const n = teams.length
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = []
    for (let i = 0; i < n / 2; i++) {
      const home = teams[i]!
      const away = teams[n - 1 - i]!
      if (home !== bye && away !== bye) pairs.push([home, away])
    }
    rounds.push(pairs)
    // Rotate everything but the first.
    teams.splice(1, 0, teams.pop()!)
  }
  return rounds
}

/** A v B and B v A are one fixture. */
const pairKey = (a: string, b: string) => [a, b].sort().join("|")

const GenerateInput = z.object({
  eventId: z.string(),
  /** The first matchday. ISO date — the organiser's calendar, not ours. */
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date, as YYYY-MM-DD"),
  /** Days between rounds. A week by default, which is what a league is. */
  intervalDays: z.number().int().min(1).max(365).default(7),
  /** Kick-off, on the venue's clock. */
  timeOfDay: z.string().regex(/^\d{2}:\d{2}$/, "a time, as HH:MM").default("10:00"),
})

/**
 * The fixtures for a league or a tournament, one round robin per division.
 *
 * An organiser registered fifteen teams and then typed thirty-one fixtures into
 * a form, one at a time. `GENERATE_FIXTURES` is the model's answer and had no
 * endpoint.
 *
 * **Per division, not per event.** evt_002's fifteen teams are six U16 boys'
 * teams, five U16 girls' and four U18 girls'; a round robin across all fifteen
 * would schedule exactly the games the guard above now refuses. Same rule, and
 * the reason that fix came first.
 *
 * **Idempotent.** It adds the pairings that do not exist and leaves the rest
 * alone — so running it twice does not double the schedule, and running it
 * after entering a few by hand does not duplicate them. The dates it assigns
 * are for the fixtures it creates; an existing one keeps whatever it was given.
 *
 * TOURNAMENT and LEAGUE only, because that is what the model grants. A camp has
 * `DEFINE_SESSION_SCHEDULE` and a showcase has `GENERATE_BRACKETS` — different
 * shapes, and neither is a round robin.
 */
export const generateFixtures = authed
  .route({
    method: "POST",
    path: "/events/{eventId}/games/generate",
    summary: "Generate a round robin per division",
    successStatus: 201,
    ...authedRoute,
  })
  .input(GenerateInput)
  .output(z.object({ created: z.number().int(), skipped: z.number().int() }))
  .use(requireAction("GENERATE_FIXTURES", (i: { eventId: string }) => i.eventId))
  .handler(async ({ context, input }) => {
    const entries = await context.db
      .select({ teamId: schema.eventTeam.teamId, divisionId: schema.eventTeam.divisionId })
      .from(schema.eventTeam)
      .where(eq(schema.eventTeam.eventId, input.eventId))
      .all()

    const byDivision = new Map<string, string[]>()
    for (const e of entries) {
      const list = byDivision.get(e.divisionId) ?? []
      if (!list.includes(e.teamId)) list.push(e.teamId)
      byDivision.set(e.divisionId, list)
    }

    const existing = new Set(
      (
        await context.db
          .select({ homeTeamId: schema.game.homeTeamId, awayTeamId: schema.game.awayTeamId })
          .from(schema.game)
          .where(eq(schema.game.eventId, input.eventId))
          .all()
      ).map((g) => pairKey(g.homeTeamId, g.awayTeamId)),
    )

    const rows: (typeof schema.game.$inferInsert)[] = []
    let skipped = 0
    for (const teams of byDivision.values()) {
      // Sorted, so the same registrations always produce the same schedule —
      // a generator whose output depends on row order is one nobody can check.
      roundRobin([...teams].sort()).forEach((round, roundIndex) => {
        const day = new Date(`${input.startDate}T00:00:00.000Z`)
        day.setUTCDate(day.getUTCDate() + roundIndex * input.intervalDays)
        const startsAt = `${day.toISOString().slice(0, 10)}T${input.timeOfDay}:00.000Z`

        for (const [home, away] of round) {
          if (existing.has(pairKey(home, away))) {
            skipped += 1
            continue
          }
          existing.add(pairKey(home, away))
          rows.push({
            id: `gam_${crypto.randomUUID().slice(0, 8)}`,
            eventId: input.eventId,
            homeTeamId: home,
            awayTeamId: away,
            venueId: null,
            startsAt,
            statusCode: "SCHEDULED",
          })
        }
      })
    }

    if (rows.length > 0) await context.db.insert(schema.game).values(rows)
    return { created: rows.length, skipped }
  })

export const update = authed
  .route({ method: "PUT", path: "/events/{eventId}/games/{id}", summary: "Change a fixture", ...authedRoute })
  // `venueId` is deliberately not here: which court a fixture is on is
  // `ASSIGN_COURTS`, and it has its own endpoint below. Leaving it on this
  // input would mean `MANAGE_FIXTURES` could do an action the model names
  // separately — harmless while the grants match, and a silent bypass the day
  // they do not.
  .input(FixtureInput.omit({ venueId: true }).partial().extend({ id: z.string(), eventId: z.string() }))
  .output(GameSchema)
  .errors({
    TEAM_PLAYS_ITSELF: ERRORS.TEAM_PLAYS_ITSELF,
    TEAMS_IN_DIFFERENT_DIVISIONS: ERRORS.TEAMS_IN_DIFFERENT_DIVISIONS,
  })
  .use(requireAction("MANAGE_FIXTURES", (i: { eventId: string }) => i.eventId))
  .handler(async ({ context, input, errors }) => {
    const { id, eventId, ...columns } = input
    if (columns.homeTeamId && columns.awayTeamId && columns.homeTeamId === columns.awayTeamId) {
      throw errors.TEAM_PLAYS_ITSELF()
    }
    /**
     * Guarded here too, against the *effective* pairing.
     *
     * Changing one side of an existing fixture crosses a division as easily as
     * creating one, and this input is partial — so checking only when both ids
     * arrive would leave "swap the home team" as the way round the rule. The
     * stored row supplies whichever side was not sent.
     */
    if (columns.homeTeamId || columns.awayTeamId) {
      const current = found(
        await context.db
          .select({ homeTeamId: schema.game.homeTeamId, awayTeamId: schema.game.awayTeamId })
          .from(schema.game)
          .where(eq(schema.game.id, id))
          .get(),
      )
      const home = columns.homeTeamId ?? current.homeTeamId
      const away = columns.awayTeamId ?? current.awayTeamId
      if (home === away) throw errors.TEAM_PLAYS_ITSELF()
      await assertSameDivision(context.db, eventId, home, away, errors.TEAMS_IN_DIFFERENT_DIVISIONS)
    }
    /**
     * Nothing to change is not an error, and it is not a crash either.
     *
     * The input is partial, so a request naming only the ids is valid — and
     * `db.update().set({})` throws "No values to set", which reached the client
     * as a 500. Found by a test asserting that `venueId` cannot be smuggled
     * through this endpoint: zod strips the unknown key, which left exactly the
     * empty object nobody had sent before.
     */
    if (Object.keys(columns).length) {
      await context.db.update(schema.game).set(columns).where(eq(schema.game.id, id))
    }
    return reload(context.db, context.user, id)
  })

/**
 * Which court a fixture is played on.
 *
 * `ASSIGN_COURTS` is the model's own action and had no endpoint, which showed:
 * `generateFixtures` writes every game with `venueId: null`, so generating a
 * season produced thirty-one fixtures that read "Venue TBC" and stayed that way
 * — the schedule could show a court and nothing could ever set one.
 *
 * ## Why this is not just a field on `update`
 *
 * `FixtureInput` accepts `venueId`, so `MANAGE_FIXTURES` could already set one.
 * The model names two actions, and today they carry identical grants — OWNER,
 * CO_ORGANIZER and PLATFORM_ADMIN on TOURNAMENT, LEAGUE and SHOWCASE — so
 * routing courts through `update` was invisible rather than wrong. It would
 * stop being invisible the moment the Product Owner grants `ASSIGN_COURTS` to
 * anyone else, and the bug would be that court assignment quietly kept
 * requiring the wider right. `venueId` is off `update` for that reason: two
 * actions, two doors, and no way to use one to do the other's job.
 *
 * ## Only venues the event actually plays at
 *
 * `eventVenue` says which courts an event runs on. Offering every venue on the
 * platform would let an organiser schedule a Bangkok fixture into a Chiang Mai
 * sports hall by picking the wrong row of a long dropdown — the same mistake
 * `setDivisions` and the fixture guard exist to prevent, and the same fix: the
 * form filters, and the endpoint refuses.
 */
export const assignVenue = authed
  .route({
    method: "PUT",
    path: "/events/{eventId}/games/{id}/venue",
    summary: "Assign a fixture to a court",
    ...authedRoute,
  })
  .input(
    z.object({
      id: z.string(),
      eventId: z.string(),
      // Nullable, because un-assigning is a real thing an organiser does when a
      // court falls through and the fixture stands.
      venueId: z.string().nullable(),
    }),
  )
  .output(GameSchema)
  .errors({ VENUE_NOT_AT_EVENT: ERRORS.VENUE_NOT_AT_EVENT })
  .use(requireAction("ASSIGN_COURTS", (i: { eventId: string }) => i.eventId))
  .handler(async ({ context, input, errors }) => {
    // The fixture must be this event's. Without it, the eventId in the path is
    // just the id the authorisation check reads — pass an event you own and any
    // game id on the platform and the write lands.
    const game = found(
      await context.db
        .select({ id: schema.game.id, eventId: schema.game.eventId })
        .from(schema.game)
        .where(eq(schema.game.id, input.id))
        .get(),
    )
    if (game.eventId !== input.eventId) throw errors.VENUE_NOT_AT_EVENT()

    if (input.venueId) {
      const at = await context.db
        .select({ venueId: schema.eventVenue.venueId })
        .from(schema.eventVenue)
        .where(eq(schema.eventVenue.eventId, input.eventId))
        .all()
      if (!at.some((v) => v.venueId === input.venueId)) {
        throw errors.VENUE_NOT_AT_EVENT({ data: { venueId: input.venueId } })
      }
    }

    await context.db
      .update(schema.game)
      .set({ venueId: input.venueId })
      .where(eq(schema.game.id, input.id))
    return reload(context.db, context.user, input.id)
  })

export const remove = authed
  .route({ method: "DELETE", path: "/events/{eventId}/games/{id}", summary: "Remove a fixture", ...authedRoute })
  .input(z.object({ id: z.string(), eventId: z.string() }))
  .output(z.object({ removed: z.string() }))
  .use(requireAction("MANAGE_FIXTURES", (i: { eventId: string }) => i.eventId))
  .handler(async ({ context, input }) => {
    // Referees first: the row points at the game and would orphan.
    await context.db.delete(schema.gameReferee).where(eq(schema.gameReferee.gameId, input.id))
    const res = await context.db.delete(schema.game).where(eq(schema.game.id, input.id))
    if (res.meta.changes === 0) throw new ORPCError("NOT_FOUND", { message: "Not found" })
    return { removed: input.id }
  })

/**
 * Who officiates.
 *
 * `ASSIGN_REFEREE` is GAME-scoped and granted to whoever runs the event above
 * it — deliberately not to referees. Choosing who officiates is not a referee's
 * decision, and a referee who could assign themselves would undo the point of
 * assigning anyone, which is what makes `ENTER_SCORES` safe.
 */
/**
 * Say that this game is being broadcast, and keep saying it.
 *
 * Also the heartbeat: one idempotent call rather than a start and a separate
 * ping, so a publisher that reconnects mid-game simply resumes rather than
 * needing to know whether it had already started.
 *
 * One row per game is Cloudflare's rule as much as ours — their relay allows a
 * single publisher per path, so a second camera on the same game replaces the
 * first here exactly as it would there.
 */
export const startBroadcast = authed
  .route({ method: "PUT", path: "/games/{id}/broadcast", summary: "Start or refresh a live broadcast", ...authedRoute })
  .input(IdInput)
  .output(z.object({ broadcasting: z.literal(true) }))
  .use(requireAction("BROADCAST_GAME"))
  .handler(async ({ context, input }) => {
    const now = new Date().toISOString()
    // Read first, so the *transition* is distinguishable from the heartbeat.
    // This procedure is called every twenty seconds for as long as a camera is
    // pointed at the game; recording each call would say a broadcast that ran
    // for an hour is a hundred and eighty times more interesting than one that
    // ran for a minute, which is backwards.
    const [existing] = await context.db
      .select({ startedAt: schema.gameBroadcast.startedAt })
      .from(schema.gameBroadcast)
      .where(eq(schema.gameBroadcast.gameId, input.id))
      .limit(1)

    await context.db
      .insert(schema.gameBroadcast)
      .values({ gameId: input.id, userId: context.user.id, startedAt: now, lastSeenAt: now })
      .onConflictDoUpdate({
        target: schema.gameBroadcast.gameId,
        // `startedAt` is deliberately not touched on a refresh: it is when this
        // broadcast began, which is what a viewer joining late wants to know.
        set: { userId: context.user.id, lastSeenAt: now },
      })

    if (!existing) track(context.env, "broadcast.started", { gameId: input.id })
    return { broadcasting: true as const }
  })

export const stopBroadcast = authed
  .route({ method: "DELETE", path: "/games/{id}/broadcast", summary: "Stop a live broadcast", ...authedRoute })
  .input(IdInput)
  .output(z.object({ broadcasting: z.literal(false) }))
  .use(requireAction("BROADCAST_GAME"))
  .handler(async ({ context, input }) => {
    const [existing] = await context.db
      .select({ startedAt: schema.gameBroadcast.startedAt })
      .from(schema.gameBroadcast)
      .where(eq(schema.gameBroadcast.gameId, input.id))
      .limit(1)

    await context.db.delete(schema.gameBroadcast).where(eq(schema.gameBroadcast.gameId, input.id))

    // How long it ran is the number that says whether this works in a gym. A
    // broadcast that ends after forty seconds, every time, is a story about
    // uplinks and batteries that no error count would tell.
    if (existing) {
      track(context.env, "broadcast.ended", {
        gameId: input.id,
        seconds: Math.round((Date.now() - Date.parse(existing.startedAt)) / 1000),
      })
    }
    return { broadcasting: false as const }
  })

export const assignReferee = authed
  .route({ method: "POST", path: "/games/{id}/referees", summary: "Assign a referee to a game", successStatus: 201, ...authedRoute })
  .errors({ UNKNOWN_USER: ERRORS.UNKNOWN_USER, NOT_A_REFEREE: ERRORS.NOT_A_REFEREE })
  .input(z.object({ id: z.string(), userId: z.string() }))
  .output(z.object({ gameId: z.string(), userId: z.string() }))
  .use(requireAction("ASSIGN_REFEREE"))
  .handler(async ({ context, input, errors }) => {
    const person = await context.db
      .select({ id: schema.user.id, role: schema.user.role })
      .from(schema.user)
      .where(eq(schema.user.id, input.userId))
      .get()
    if (!person) throw errors.UNKNOWN_USER()
    // The platform role is what says someone officiates at all. Assigning a
    // coach as referee is not a permission question, it is a mistake.
    if (person.role !== STORED_ROLE.REFEREE) throw errors.NOT_A_REFEREE()

    await context.db
      .insert(schema.gameReferee)
      .values({ gameId: input.id, userId: input.userId })
      .onConflictDoNothing()
    return { gameId: input.id, userId: input.userId }
  })

export const unassignReferee = authed
  .route({ method: "DELETE", path: "/games/{id}/referees/{userId}", summary: "Take a referee off a game", ...authedRoute })
  .errors({ NOT_ASSIGNED: ERRORS.NOT_ASSIGNED })
  .input(z.object({ id: z.string(), userId: z.string() }))
  .output(z.object({ removed: z.string() }))
  .use(requireAction("ASSIGN_REFEREE"))
  .handler(async ({ context, input, errors }) => {
    const res = await context.db
      .delete(schema.gameReferee)
      .where(
        and(eq(schema.gameReferee.gameId, input.id), eq(schema.gameReferee.userId, input.userId)),
      )
    if (res.meta.changes === 0) throw errors.NOT_ASSIGNED()
    return { removed: input.userId }
  })
