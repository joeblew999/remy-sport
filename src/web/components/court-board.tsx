import { useEffect } from "react";
import { useEventVenues, useGames } from "../lib/data";
import { useLocale } from "../lib/locale";
import { routeHref } from "../lib/router";
import { GameSummary } from "./game-summary";
import { EmptyState, Loading } from "./states";
import { m } from "../lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Muted, SubHeading } from "./page"

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
  if (isPending) return <Loading />;
  if (!courts.size) return <EmptyState data-testid="court-board-none">{m.no_courts_yet()}</EmptyState>;
  return <div className="flex flex-col gap-4" data-testid="court-board">
    <SubHeading>{m.tab_courts()}</SubHeading>
    {[...courts].map(([venueId, title]) => {
      const assigned = games.filter(g => g.venueId === venueId);
      const live = assigned.filter(g => g.statusCode === "LIVE" || g.statusCode === "HALF_TIME");
      const next = assigned.find(g => g.statusCode === "SCHEDULED");
      return <Card id={`court-${venueId}`} key={venueId} data-testid={`court-${venueId}`}>
        <CardHeader><CardTitle><a className="hover:underline" href={routeHref({ page: "event", id: eventId, query: { tab: "places", venue: venueId } })}>{title}</a></CardTitle></CardHeader>
        <CardContent className="divide-y">
          {live.length > 1 && <Muted className="pb-3" role="status">{m.venue_multiple_live()}</Muted>}
          {live.map(g => <div className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0" key={g.id} data-testid={`court-${venueId}-live`}>
            <GameSummary game={g}/><span className="font-semibold tabular-nums">{spoiler ? m.spoiler_hidden() : `${g.homeScore ?? "—"} – ${g.awayScore ?? "—"}`}</span>
          </div>)}
          {next && <div className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0" data-testid={`court-${venueId}-next`}><Muted as="span">{m.court_next()}</Muted><GameSummary game={next}/></div>}
          {!live.length && !next && <Muted data-testid={`court-${venueId}-free`}>{m.court_free()}</Muted>}
        </CardContent>
      </Card>;
    })}
    {games.some(g => !g.venueId) && <a className="w-fit text-sm underline underline-offset-4" href={routeHref({ page: "event", id: eventId, query: { tab: "games" } })}>{m.games_unassigned()}</a>}
  </div>;
}
