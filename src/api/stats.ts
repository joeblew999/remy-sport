/**
 * What a player did, game by game — the box score.
 *
 * `VIEW_PLAYER_STATS` has been granted to `PUBLIC` in the model since it was
 * written and answered by no screen, because nothing recorded a player's line:
 * `game` carries `homeScore` and `awayScore` and stops there. A player's page
 * was a name, a number and a position, and a "Top performers" section was
 * deleted rather than faked. The `game` docstring said what the fix was —
 * "a box score is a separate table when it arrives" — and `playerGameStat` is
 * that table.
 *
 * ## Behind a session, which is stricter than the model
 *
 * `VIEW_PLAYER_STATS` is granted to `PUBLIC`, and these endpoints require a
 * session anyway — the line this repo already drew for `players.list`,
 * `players.get`, `playerTeams` and `eventPlayers`, all of which are
 * `stricterThanModel` for one reason: **these rows name minors.** A box score
 * names a child and what they did, which is more about them than a roster row,
 * not less. A gym wall is not the internet.
 *
 * `check-authz` requires that difference to be declared rather than merely
 * coded, so the reason travels with it and a reviewer sees the choice.
 *
 * The season totals below are computed from the rows on every request rather
 * than stored, for the reason `standings.ts` gives about the league table: a
 * stored total is wrong the moment a scorer corrects a line, and a correction
 * is exactly when somebody looks.
 *
 * ## Writing is `ENTER_SCORES`, and there is no new action
 *
 * The model grants `ENTER_SCORES` to a game's event owner, its co-organiser,
 * its assigned referee and the platform admin — the people at the scorer's
 * table. The person typing 68–54 is the person reading the player lines off the
 * same sheet, so asking the model for a second action would have invented a
 * permission the sport does not have. AGENTS.md: grep the model for an action
 * that already covers it before writing an authorisation check by hand.
 */

import { z } from "zod"
import { eq } from "drizzle-orm"
import * as schema from "../db/schema"
import { authed, stricterThanModel } from "./base"

/**
 * One line. Every count is nullable for the same reason a game's scores are:
 * a player with no line recorded is not a player who scored nothing, and
 * flattening the two would put a row of zeroes against somebody who never left
 * the bench.
 */
const LineSchema = z.object({
  gameId: z.string(),
  playerId: z.string(),
  points: z.number().int().nullable(),
  rebounds: z.number().int().nullable(),
  assists: z.number().int().nullable(),
  fouls: z.number().int().nullable(),
})

export const forPlayer = authed
  .use(stricterThanModel("VIEW_PLAYER_STATS",
    "the model grants this to PUBLIC; a box score names a minor and what they did, so a session is required — the same line domain.ts draws for every roster"))
  .route({ method: "GET", path: "/players/{playerId}/stats", summary: "One player's box scores" })
  .input(z.object({ playerId: z.string() }))
  .output(
    z.object({
      lines: z.array(LineSchema),
      /**
       * Games with a line, not games played.
       *
       * A player can be on a squad for a game nobody kept a sheet for, so this
       * is the denominator the averages actually have — calling it "games
       * played" would make a season look shorter than it was.
       */
      recorded: z.number().int(),
      totals: z.object({
        points: z.number().int(),
        rebounds: z.number().int(),
        assists: z.number().int(),
        fouls: z.number().int(),
      }),
    }),
  )
  .handler(async ({ context, input }) => {
    const lines = await context.db
      .select({
        gameId: schema.playerGameStat.gameId,
        playerId: schema.playerGameStat.playerId,
        points: schema.playerGameStat.points,
        rebounds: schema.playerGameStat.rebounds,
        assists: schema.playerGameStat.assists,
        fouls: schema.playerGameStat.fouls,
      })
      .from(schema.playerGameStat)
      .innerJoin(schema.game, eq(schema.game.id, schema.playerGameStat.gameId))
      .where(eq(schema.playerGameStat.playerId, input.playerId))
      // Most recent first: a player's page opens on their last game, not their
      // first. Ordered explicitly, because five lists in this API came back in
      // the query planner's order until 2026-09-04 and nobody could see it.
      .orderBy(schema.game.startsAt)
      .all()

    const sum = (of: (l: (typeof lines)[number]) => number | null) =>
      lines.reduce((n, l) => n + (of(l) ?? 0), 0)

    return {
      lines,
      recorded: lines.length,
      totals: {
        points: sum((l) => l.points),
        rebounds: sum((l) => l.rebounds),
        assists: sum((l) => l.assists),
        fouls: sum((l) => l.fouls),
      },
    }
  })

export const forGame = authed
  .use(stricterThanModel("VIEW_PLAYER_STATS",
    "the model grants this to PUBLIC; a box score names minors, so a session is required"))
  .route({ method: "GET", path: "/games/{gameId}/stats", summary: "One game's box score" })
  .input(z.object({ gameId: z.string() }))
  .output(z.object({ lines: z.array(LineSchema.extend({ names: z.record(z.string(), z.string()) })) }))
  .handler(async ({ context, input }) => {
    const lines = await context.db
      .select({
        gameId: schema.playerGameStat.gameId,
        playerId: schema.playerGameStat.playerId,
        names: schema.player.names,
        points: schema.playerGameStat.points,
        rebounds: schema.playerGameStat.rebounds,
        assists: schema.playerGameStat.assists,
        fouls: schema.playerGameStat.fouls,
      })
      .from(schema.playerGameStat)
      .innerJoin(schema.player, eq(schema.player.id, schema.playerGameStat.playerId))
      .where(eq(schema.playerGameStat.gameId, input.gameId))
      // By points, then by name. A box score is read to find out who scored,
      // and two players on nine points should not swap places between requests.
      .all()

    return {
      lines: [...lines]
        .map((l) => ({ ...l, names: l.names as Record<string, string> }))
        .sort((a, b) => (b.points ?? 0) - (a.points ?? 0) || a.playerId.localeCompare(b.playerId)),
    }
  })
