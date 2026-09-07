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
import { and, desc, eq, inArray, isNull, lte, gte, or } from "drizzle-orm"
import { ORPCError } from "@orpc/server"
import * as schema from "../db/schema"
import { authed, authedRoute, found, requireAction, stricterThanModel, type Db } from "./base"
import { NamesSchema } from "../domain/api"

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
      .orderBy(desc(schema.game.startsAt))
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

/** The squad on the fixture's date, plus recorded lines retained for correction. */
async function squad(db: Db, id: string) {
  const game = found(await db.query.game.findFirst({ where: eq(schema.game.id, id),
    with: { event: { columns: { timezone: true } } },
  }))
  // Membership dates refer to the event's calendar, not the UTC date of kickoff.
  const parts = new Intl.DateTimeFormat("en", { timeZone: game.event.timezone ?? "UTC",
    year: "numeric", month: "2-digit", day: "2-digit", calendar: "gregory", numberingSystem: "latn",
  }).formatToParts(new Date(game.startsAt))
  const part = (type: string) => parts.find((p) => p.type === type)!.value
  const day = `${part("year")}-${part("month")}-${part("day")}`
  const memberships = await db.select({ playerId: schema.playerTeam.playerId })
    .from(schema.playerTeam).where(and(
      inArray(schema.playerTeam.teamId, [game.homeTeamId, game.awayTeamId]),
      lte(schema.playerTeam.fromDate, day),
      or(isNull(schema.playerTeam.toDate), gte(schema.playerTeam.toDate, day)),
    ))
  const lines = await db.select().from(schema.playerGameStat).where(eq(schema.playerGameStat.gameId, id))
  return { ids: [...new Set([...memberships.map((p) => p.playerId), ...lines.map((p) => p.playerId)])], lines }
}

export const forGame = authed
  .use(requireAction("ENTER_SCORES"))
  .route({ method: "GET", path: "/games/{id}/stats", summary: "Scorekeeper's player lines", ...authedRoute })
  .input(z.object({ id: z.string() }))
  .output(z.object({ players: z.array(LineSchema.extend({ names: NamesSchema })) }))
  .handler(async ({ context, input }) => {
    const { ids, lines } = await squad(context.db, input.id)
    const players = ids.length ? await context.db.select().from(schema.player)
      .where(inArray(schema.player.id, ids)) : []
    return { players: players.map((p) => ({
      gameId: input.id, playerId: p.id, names: p.names,
      points: null, rebounds: null, assists: null, fouls: null,
      ...lines.find((l) => l.playerId === p.id),
    })) }
  })

const Count = z.number().int().nonnegative().nullable()
export const setLine = authed
  .use(requireAction("ENTER_SCORES"))
  .route({ method: "PUT", path: "/games/{id}/stats/{playerId}", summary: "Record or correct a player's box score", ...authedRoute })
  .input(z.object({ id: z.string(), playerId: z.string(), points: Count, rebounds: Count, assists: Count, fouls: Count }))
  .output(LineSchema)
  .handler(async ({ context, input }) => {
    const { id, ...values } = input
    const { ids } = await squad(context.db, id)
    if (!ids.includes(input.playerId)) throw new ORPCError("NOT_FOUND")
    const row = { gameId: id, ...values }
    // Blank means unrecorded; zero is an actual recorded count. Clearing a
    // whole line removes it from the season's recorded-game denominator.
    if ([values.points, values.rebounds, values.assists, values.fouls].every((n) => n === null)) {
      await context.db.delete(schema.playerGameStat).where(and(
        eq(schema.playerGameStat.gameId, id), eq(schema.playerGameStat.playerId, values.playerId),
      ))
    } else {
      await context.db.insert(schema.playerGameStat).values(row).onConflictDoUpdate({
        target: [schema.playerGameStat.gameId, schema.playerGameStat.playerId], set: values,
      })
    }
    return row
  })
