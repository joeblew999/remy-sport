import { useGames } from "../lib/data";
import { m } from "../lib/i18n";

/**
 * Which game is on which court, right now.
 *
 * `VIEW_COURT_STATUS_BOARD` and `VIEW_COURT_ASSIGNMENTS` are two of the actions
 * the model granted that no screen offered until this one. Both are PUBLIC,
 * which is the point: this is the screen somebody standing in a sports hall
 * looks at, and they are not signed in.
 *
 * It needed no new data. `games.list` already returns each game's venue and
 * status; the board is that list turned on its side. `ASSIGN_COURTS` has been
 * writing this all along with nowhere to read it.
 *
 * A tab on the event rather than a route of its own, for the reason the
 * standings tab exists: a court board belongs to the event being played on it.
 * There is no such thing as "the courts" across every event at once.
 */

/** In play, as the model names it. `game_status` holds both. */
const PLAYING = new Set(["LIVE", "HALF_TIME"])

/**
 * @answers VIEW_COURT_STATUS_BOARD, VIEW_COURT_ASSIGNMENTS, VIEW_MATCH_STATUS
 *
 * One board answers all three: which court, what is on it, and what state it
 * is in. `game.statusCode` is the match status.
 */
export function CourtBoard({ eventId }: { eventId: string | undefined }) {
  const { data, isPending } = useGames(eventId)
  const games = data?.games ?? []

  if (isPending) return <div className="empty">{m.loading()}</div>

  /**
   * One row per court, in the order the venues were assigned.
   *
   * Games with no venue are left out rather than bucketed under "unassigned":
   * this board answers "what is happening on court 2", and a game with no court
   * is not happening anywhere yet. The schedule tab is where it belongs.
   */
  const courts = new Map<string, { name: string; now?: (typeof games)[number]; next?: (typeof games)[number] }>()
  for (const g of games) {
    if (!g.venueId || !g.venue) continue
    const court = courts.get(g.venueId) ?? { name: g.venue }
    if (PLAYING.has(g.statusCode)) court.now = g
    else if (g.statusCode === "SCHEDULED" && !court.next) court.next = g
    courts.set(g.venueId, court)
  }

  if (courts.size === 0) {
    return (
      <div className="empty" data-testid="court-board-none">
        {m.no_courts_yet()}
      </div>
    )
  }

  return (
    <div className="dash-card" data-testid="court-board">
      {[...courts.entries()].map(([venueId, court]) => (
        <div key={venueId} className="device-row" data-testid={`court-${venueId}`}>
          <div>
            <div className="device-label">{court.name}</div>
            <div className="device-meta">
              {court.now ? (
                // In play. The score is the thing a person in the hall wants,
                // and it is already on the game.
                <span data-testid={`court-${venueId}-live`}>
                  {court.now.homeTeam} {court.now.homeScore ?? 0} – {court.now.awayScore ?? 0}{" "}
                  {court.now.awayTeam} · {court.now.statusLabel}
                </span>
              ) : court.next ? (
                <span data-testid={`court-${venueId}-next`}>
                  {m.court_next()}: {court.next.homeTeam} {m.versus()} {court.next.awayTeam}
                </span>
              ) : (
                // Free, and saying so is information. An empty cell reads as a
                // page that failed to load.
                <span data-testid={`court-${venueId}-free`}>{m.court_free()}</span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
