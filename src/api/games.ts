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
import { eq } from "drizzle-orm"
import { z } from "zod"
import * as schema from "../db/schema"
import { EnterScoreInput, GameSchema, SetGameStatusInput, type ApiGame } from "../domain/api"
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
