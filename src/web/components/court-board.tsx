import { useEffect } from "react";
import { useEventVenues, useGames } from "../lib/data";
import { useLocale } from "../lib/locale";
import { routeHref } from "../lib/router";
import { GameSummary } from "./game-summary";
import { m } from "../lib/i18n";

/** @answers VIEW_COURT_STATUS_BOARD, VIEW_COURT_ASSIGNMENTS, VIEW_MATCH_STATUS
 * The model assigns games to venues, not numbered courts. Show all live games
 * at a venue instead of overwriting one with another or inventing court IDs.
 */
export function CourtBoard({ eventId, spoiler = false, courtId }: { eventId?: string; spoiler?: boolean; courtId?: string }) {
  const { data, isPending } = useGames(eventId);
  const { rows } = useEventVenues(eventId);
  const { name } = useLocale();
  const games = data?.games ?? [];
  const courts = new Map(rows.map(({ venue }) => [venue.id, name(venue.names)]));
  for (const g of games) if (g.venueId && g.venue) courts.set(g.venueId, g.venue);
  useEffect(() => {
    if (courtId && !isPending) document.getElementById(`court-${courtId}`)?.scrollIntoView({ block: "start" });
  }, [courtId, isPending]);
  if (isPending) return <div className="empty">{m.loading()}</div>;
  if (!courts.size) return <div className="empty" data-testid="court-board-none">{m.no_courts_yet()}</div>;
  return <div className="page-inner" data-testid="court-board">
    <h2>{m.tab_courts()}</h2>
    {[...courts].map(([venueId, title]) => {
      const assigned = games.filter(g => g.venueId === venueId);
      const live = assigned.filter(g => g.statusCode === "LIVE" || g.statusCode === "HALF_TIME");
      const next = assigned.find(g => g.statusCode === "SCHEDULED");
      return <section className="game-group panel-list" id={`court-${venueId}`} key={venueId} data-testid={`court-${venueId}`}>
        <h3><a href={routeHref({ page: "event", id: eventId, query: { tab: "places", venue: venueId } })}>{title}</a></h3>
        {live.length > 1 && <p role="status">{m.venue_multiple_live()}</p>}
        {live.map(g => <div className="court-game" key={g.id} data-testid={`court-${venueId}-live`}>
          <GameSummary game={g}/><span>{spoiler ? m.spoiler_hidden() : `${g.homeScore ?? "—"} – ${g.awayScore ?? "—"}`}</span>
        </div>)}
        {next && <div className="court-game" data-testid={`court-${venueId}-next`}><span>{m.court_next()}</span><GameSummary game={next}/></div>}
        {!live.length && !next && <p data-testid={`court-${venueId}-free`}>{m.court_free()}</p>}
      </section>;
    })}
    {games.some(g => !g.venueId) && <a href={routeHref({ page: "event", id: eventId, query: { tab: "games" } })}>{m.games_unassigned()}</a>}
  </div>;
}
