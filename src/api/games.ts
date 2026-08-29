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
import { and, eq, gte } from "drizzle-orm"
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
import { authed, authedRoute, can, openTo, requireAction, viewer, viewerTimezone, type Db, type SessionUser } from "./base"

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
async function serialize(db: Db, user: SessionUser | null, row: Row): Promise<ApiGame> {
  const { homeTeam, awayTeam, venue, event, ...rest } = row
  const assign = await can(db, "ASSIGN_REFEREE", user, row.id)
  const onThisGame = await db
    .select({ userId: schema.gameReferee.userId, name: schema.user.name })
    .from(schema.gameReferee)
    .innerJoin(schema.user, eq(schema.user.id, schema.gameReferee.userId))
    .where(eq(schema.gameReferee.gameId, row.id))
    .all()
  return {
    ...rest,
    homeTeamNames: homeTeam?.names ?? {},
    awayTeamNames: awayTeam?.names ?? {},
    venueNames: venue?.names ?? null,
    timezone: event?.timezone ?? null,
    canEnterScore: await can(db, "ENTER_SCORES", user, row.id),
    canSetStatus: await can(db, "CONFIRM_MATCH_STATUS", user, row.id),
    canAssignReferee: assign,
    // From our table, refreshed by the publisher's heartbeat — see
    // BROADCAST_STALE_SECONDS. A row nobody has touched is not a live game.
    isBroadcasting: Boolean(
      await db
        .select({ gameId: schema.gameBroadcast.gameId })
        .from(schema.gameBroadcast)
        .where(
          and(
            eq(schema.gameBroadcast.gameId, row.id),
            gte(schema.gameBroadcast.lastSeenAt, freshSince()),
          ),
        )
        .get(),
    ),
    canBroadcast: await can(db, "BROADCAST_GAME", user, row.id),
    /**
     * Referees not already on this game, and only for someone who may assign
     * one. A global "list every referee" endpoint would be a directory of
     * people, readable by anyone who found it; this is the same list scoped to
     * the one decision it exists for.
     */
    availableReferees: assign
      ? (
          await db
            .select({ userId: schema.user.id, name: schema.user.name })
            .from(schema.user)
            .where(eq(schema.user.role, STORED_ROLE.REFEREE))
            .all()
        ).filter((c) => !onThisGame.some((r) => r.userId === c.userId))
      : [],
    referees: onThisGame.map((r) => ({ userId: r.userId, name: r.name })),
  }
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
      games: await Promise.all(rows.map((r) => serialize(context.db, context.user, r))),
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
    const row = await context.db.query.game.findFirst({
      where: (g, { eq: is }) => is(g.id, input.id),
      with: withNames,
    })
    if (!row) throw new ORPCError("NOT_FOUND", { message: "Not found" })
    return serialize(context.db, context.user, row)
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
  const row = await db.query.game.findFirst({
    where: (g, { eq: is }) => is(g.id, id),
    with: withNames,
  })
  if (!row) throw new ORPCError("NOT_FOUND", { message: "Not found" })
  return serialize(db, user, row)
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

export const update = authed
  .route({ method: "PUT", path: "/events/{eventId}/games/{id}", summary: "Change a fixture", ...authedRoute })
  .input(FixtureInput.partial().extend({ id: z.string(), eventId: z.string() }))
  .output(GameSchema)
  .errors({ TEAM_PLAYS_ITSELF: ERRORS.TEAM_PLAYS_ITSELF })
  .use(requireAction("MANAGE_FIXTURES", (i: { eventId: string }) => i.eventId))
  .handler(async ({ context, input, errors }) => {
    const { id, eventId: _eventId, ...columns } = input
    if (columns.homeTeamId && columns.awayTeamId && columns.homeTeamId === columns.awayTeamId) {
      throw errors.TEAM_PLAYS_ITSELF()
    }
    await context.db.update(schema.game).set(columns).where(eq(schema.game.id, id))
    return reload(context.db, context.user, id)
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
