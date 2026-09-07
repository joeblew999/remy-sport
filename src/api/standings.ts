/**
 * The league table — derived, never stored.
 *
 * Every number here is a function of the games: played, won, lost, points for
 * and against, and the league points the Product Owner's `STANDINGS_POINTS`
 * defines. Storing a table would mean keeping it in step with every score that
 * is entered or corrected, and a correction is exactly when a stored table goes
 * wrong — AGENTS.md's "derive, don't store anything that is a function of other
 * columns", applied to the case that most tempts people to cache.
 *
 * Public, because `VIEW_STANDINGS` is granted to `PUBLIC`.
 *
 * This replaces a hardcoded fixture that had been rendering on the event page
 * and `#/standings` since the SPA was built — eight invented schools with
 * invented records.
 */

import { z } from "zod"
import { StandingsSchema } from "../domain/api"
import { STANDINGS_POINTS } from "../domain/vocabularies"
import { openTo, pub } from "./base"

/** One team's line, before it is ranked. */
interface Line {
  teamId: string
  teamNames: Record<string, string>
  divisionId: string | null
  divisionNames: Record<string, string> | null
  played: number
  won: number
  lost: number
  pointsFor: number
  pointsAgainst: number
}

/**
 * Ordered the way a basketball table is: league points, then the head-to-head
 * proxy everyone actually uses — point difference, then points scored.
 *
 * Not alphabetical as a final tiebreak. Two teams genuinely level on all three
 * are level, and sorting them by name would present an ordering the competition
 * has not decided.
 */
const rank = (a: Line, b: Line) =>
  b.won * STANDINGS_POINTS.win - a.won * STANDINGS_POINTS.win ||
  b.pointsFor - b.pointsAgainst - (a.pointsFor - a.pointsAgainst) ||
  b.pointsFor - a.pointsFor

export const list = pub
  .use(openTo("VIEW_STANDINGS"))
  .route({ method: "GET", path: "/standings", summary: "The league table for an event" })
  .input(z.object({ eventId: z.string() }))
  .output(z.object({ standings: z.array(StandingsSchema) }))
  .handler(async ({ context, input }) => {
    /**
     * Every registered team, so a team that has not played yet still appears.
     *
     * A table built only from games would silently omit them, which reads as
     * "not in this competition" rather than "no games yet" — and at the start of
     * a season that is every team.
     */
    const registered = await context.db.query.eventTeam.findMany({
      where: (et, { eq }) => eq(et.eventId, input.eventId),
      with: {
        team: { columns: { id: true, names: true } },
        division: { columns: { id: true, names: true } },
      },
    })

    const lines = new Map<string, Line>()
    for (const r of registered) {
      if (!r.team) continue
      lines.set(r.team.id, {
        teamId: r.team.id,
        teamNames: r.team.names,
        divisionId: r.division?.id ?? null,
        divisionNames: r.division?.names ?? null,
        played: 0,
        won: 0,
        lost: 0,
        pointsFor: 0,
        pointsAgainst: 0,
      })
    }

    // Only finished games. A game in progress has a score, but a table that
    // moves while people are still playing is a scoreboard, not standings.
    const games = await context.db.query.game.findMany({
      where: (g, { eq, and }) => and(eq(g.eventId, input.eventId), eq(g.statusCode, "FINISHED")),
    })

    for (const g of games) {
      if (g.homeScore === null || g.awayScore === null) continue
      const home = lines.get(g.homeTeamId)
      const away = lines.get(g.awayTeamId)
      // A team that played but is not registered is a data problem, not a row
      // to invent: skip it rather than fabricate a line with no division.
      if (!home || !away || home.divisionId !== away.divisionId) continue

      home.played++
      away.played++
      home.pointsFor += g.homeScore
      home.pointsAgainst += g.awayScore
      away.pointsFor += g.awayScore
      away.pointsAgainst += g.homeScore

      // No draws in basketball; a tie means the game is not actually finished.
      if (g.homeScore > g.awayScore) {
        home.won++
        away.lost++
      } else if (g.awayScore > g.homeScore) {
        away.won++
        home.lost++
      }
    }

    const groups = Map.groupBy([...lines.values()], line => line.divisionId);
    const sorted = [...groups].sort(([a], [b]) => (a ?? "").localeCompare(b ?? "")).flatMap(([, group]) => group.sort(rank));
    // Competition ranking: true ties share a rank (1, 1, 3), independently
    // within each division. Filtering the response must not invent ranks.
    const ranksOf = (values: Line[]) => {
      const result = new Map<string, number>();
      for (const group of Map.groupBy(values, line => line.divisionId).values()) {
        group.sort(rank);
        let position = 1;
        group.forEach((line, i) => {
          if (i && rank(group[i - 1]!, line) !== 0) position = i + 1;
          result.set(line.teamId, position);
        });
      }
      return result;
    };
    const current = ranksOf(sorted);

    /**
     * Where each team stood before the most recent round — `VIEW_RANK_MOVEMENT`.
     *
     * The same computation, run again over the games that finished before the
     * latest day of play. Not a stored history: standings are a function of the
     * games, so a previous table is that function over fewer of them, and a
     * `standings_history` table would be a second copy that can disagree with
     * the games it came from.
     *
     * "The last round" is the latest date on which any game finished, rather
     * than a round number the model does not have. On a one-day tournament that
     * makes every game one round and the movement null, which is honest: nothing
     * has happened twice yet.
     */
    const lastDays = new Map<string | null, string>();
    for (const g of games) {
      const home = lines.get(g.homeTeamId), away = lines.get(g.awayTeamId);
      if (!home || !away || home.divisionId !== away.divisionId || g.homeScore === null || g.awayScore === null || !g.startsAt) continue;
      const day = g.startsAt.slice(0, 10);
      if (day > (lastDays.get(home.divisionId) ?? "")) lastDays.set(home.divisionId, day);
    }
    const earlier = games.filter(g => {
      const home = lines.get(g.homeTeamId), away = lines.get(g.awayTeamId);
      return home && away && home.divisionId === away.divisionId && g.homeScore !== null && g.awayScore !== null && g.startsAt && g.startsAt.slice(0, 10) < (lastDays.get(home.divisionId) ?? "");
    });
    const earlierDivisions = new Set(earlier.map(g => lines.get(g.homeTeamId)!.divisionId));

    /** The previous table, or none when there is nothing earlier to rank. */
    const previous = new Map<string, number>()
    if (earlier.length > 0) {
      const before = new Map<string, Line>()
      for (const [id, l] of lines) {
        before.set(id, { ...l, played: 0, won: 0, lost: 0, pointsFor: 0, pointsAgainst: 0 })
      }
      for (const g of earlier) {
        if (g.homeScore === null || g.awayScore === null) continue
        const home = before.get(g.homeTeamId)
        const away = before.get(g.awayTeamId)
        if (!home || !away || home.divisionId !== away.divisionId) continue
        home.played++
        away.played++
        home.pointsFor += g.homeScore
        home.pointsAgainst += g.awayScore
        away.pointsFor += g.awayScore
        away.pointsAgainst += g.homeScore
        if (g.homeScore > g.awayScore) {
          home.won++
          away.lost++
        } else if (g.awayScore > g.homeScore) {
          away.won++
          home.lost++
        }
      }
      for (const [id, position] of ranksOf([...before.values()].filter(l => earlierDivisions.has(l.divisionId)))) previous.set(id, position)
    }

    return {
      standings: sorted.map((line) => ({
        ...line,
        // Positive is upward: rank 4 becoming rank 2 is +2.
        movement: previous.has(line.teamId) ? previous.get(line.teamId)! - current.get(line.teamId)! : null,
        rank: current.get(line.teamId)!,
        pointsDiff: line.pointsFor - line.pointsAgainst,
        leaguePoints: line.won * STANDINGS_POINTS.win + line.lost * STANDINGS_POINTS.loss,
      })),
    }
  })
