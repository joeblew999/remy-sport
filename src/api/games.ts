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
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import * as schema from "../db/schema"
import { EnterScoreInput, GameSchema, SetGameStatusInput, type ApiGame } from "../domain/api"
import { STORED_ROLE } from "../domain/vocabularies"
import { can, requireAction, viewer, authed, authedRoute, type Db, type SessionUser } from "./base"

const IdInput = z.object({ id: z.string() })

type Row = typeof schema.game.$inferSelect & {
  homeTeam?: { names: Record<string, string> } | null
  awayTeam?: { names: Record<string, string> } | null
  venue?: { names: Record<string, string> } | null
}

const withNames = {
  homeTeam: { columns: { names: true } },
  awayTeam: { columns: { names: true } },
  venue: { columns: { names: true } },
} as const

/**
 * One `can` per game, and that is the honest cost of a per-game permission.
 *
 * A schedule of three is six extra reads; a season of three hundred would not
 * be. When that day comes the fix is to answer it in one query — the relations
 * are all derivable in SQL — not to move the decision into the client.
 */
async function serialize(db: Db, user: SessionUser | null, row: Row): Promise<ApiGame> {
  const { homeTeam, awayTeam, venue, ...rest } = row
  return {
    ...rest,
    homeTeamNames: homeTeam?.names ?? {},
    awayTeamNames: awayTeam?.names ?? {},
    venueNames: venue?.names ?? null,
    canEnterScore: await can(db, "ENTER_SCORES", user, row.id),
    canSetStatus: await can(db, "CONFIRM_MATCH_STATUS", user, row.id),
  }
}

export const list = viewer
  .route({ method: "GET", path: "/games", summary: "List games, optionally for one event" })
  .input(z.object({ eventId: z.string().optional() }))
  .output(z.object({ games: z.array(GameSchema) }))
  .handler(async ({ context, input }) => {
    const rows = await context.db.query.game.findMany({
      where: input.eventId ? (g, { eq: is }) => is(g.eventId, input.eventId!) : undefined,
      with: withNames,
      // Chronological: a schedule reads forwards, and a finished game keeps its
      // place rather than sorting to the bottom.
      orderBy: (g, { asc }) => [asc(g.startsAt)],
    })
    return { games: await Promise.all(rows.map((r) => serialize(context.db, context.user, r))) }
  })

export const get = viewer
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
    return reload(context.db, context.user, input.id)
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
    return reload(context.db, context.user, input.id)
  })

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

/** A team cannot play itself, and nothing in the schema says so. */
function assertDistinct(homeTeamId: string, awayTeamId: string) {
  if (homeTeamId === awayTeamId) {
    throw new ORPCError("BAD_REQUEST", { message: "A team cannot play itself" })
  }
}

export const create = authed
  .route({ method: "POST", path: "/events/{eventId}/games", summary: "Add a fixture", successStatus: 201, ...authedRoute })
  .input(FixtureInput)
  .output(GameSchema)
  .use(requireAction("MANAGE_FIXTURES", (i: { eventId: string }) => i.eventId))
  .handler(async ({ context, input }) => {
    assertDistinct(input.homeTeamId, input.awayTeamId)

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
      if (!ids.has(teamId)) {
        throw new ORPCError("BAD_REQUEST", { message: `${teamId} is not registered for this event` })
      }
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
  .use(requireAction("MANAGE_FIXTURES", (i: { eventId: string }) => i.eventId))
  .handler(async ({ context, input }) => {
    const { id, eventId: _eventId, ...columns } = input
    if (columns.homeTeamId && columns.awayTeamId) {
      assertDistinct(columns.homeTeamId, columns.awayTeamId)
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
export const assignReferee = authed
  .route({ method: "POST", path: "/games/{id}/referees", summary: "Assign a referee to a game", successStatus: 201, ...authedRoute })
  .input(z.object({ id: z.string(), userId: z.string() }))
  .output(z.object({ gameId: z.string(), userId: z.string() }))
  .use(requireAction("ASSIGN_REFEREE"))
  .handler(async ({ context, input }) => {
    const person = await context.db
      .select({ id: schema.user.id, role: schema.user.role })
      .from(schema.user)
      .where(eq(schema.user.id, input.userId))
      .get()
    if (!person) throw new ORPCError("NOT_FOUND", { message: "Unknown user" })
    // The platform role is what says someone officiates at all. Assigning a
    // coach as referee is not a permission question, it is a mistake.
    if (person.role !== STORED_ROLE.REFEREE) {
      throw new ORPCError("BAD_REQUEST", { message: "That account is not a referee" })
    }

    await context.db
      .insert(schema.gameReferee)
      .values({ gameId: input.id, userId: input.userId })
      .onConflictDoNothing()
    return { gameId: input.id, userId: input.userId }
  })

export const unassignReferee = authed
  .route({ method: "DELETE", path: "/games/{id}/referees/{userId}", summary: "Take a referee off a game", ...authedRoute })
  .input(z.object({ id: z.string(), userId: z.string() }))
  .output(z.object({ removed: z.string() }))
  .use(requireAction("ASSIGN_REFEREE"))
  .handler(async ({ context, input }) => {
    const res = await context.db
      .delete(schema.gameReferee)
      .where(
        and(eq(schema.gameReferee.gameId, input.id), eq(schema.gameReferee.userId, input.userId)),
      )
    if (res.meta.changes === 0) throw new ORPCError("NOT_FOUND", { message: "Not assigned" })
    return { removed: input.userId }
  })
