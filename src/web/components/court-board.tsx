import { useEffect } from "react";
import { useEventVenues, useGames } from "../lib/data";
import { useLocale } from "../lib/locale";
import { routeHref } from "../lib/router";
import { GameSummary } from "./game-summary";
import { EmptyState, Loading } from "./states";
import { m } from "../lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Muted, SubHeading } from "./page"
import { Item, ItemActions, ItemContent, ItemGroup } from "@/components/ui/item";

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
        <CardContent>
          {/* A list of what is on this court, so it is the registry's list —
              it was a divided CardContent with hand-laid rows, the same habit
              four pages had hoisted into a `const LIST`. */}
          <ItemGroup>
            {live.length > 1 && <Muted role="status">{m.venue_multiple_live()}</Muted>}
            {live.map(g => (
              <Item variant="outline" size="sm" key={g.id} data-testid={`court-${venueId}-live`}>
                <ItemContent><GameSummary game={g}/></ItemContent>
                <ItemActions><span className="font-semibold tabular-nums">{spoiler ? m.spoiler_hidden() : `${g.homeScore ?? "—"} – ${g.awayScore ?? "—"}`}</span></ItemActions>
              </Item>
            ))}
            {next && (
              <Item variant="outline" size="sm" data-testid={`court-${venueId}-next`}>
                <ItemContent><GameSummary game={next}/></ItemContent>
                <ItemActions><Muted as="span">{m.court_next()}</Muted></ItemActions>
              </Item>
            )}
            {!live.length && !next && <Muted data-testid={`court-${venueId}-free`}>{m.court_free()}</Muted>}
          </ItemGroup>
        </CardContent>
      </Card>;
    })}
    {games.some(g => !g.venueId) && <a className="w-fit text-sm underline underline-offset-4" href={routeHref({ page: "event", id: eventId, query: { tab: "games" } })}>{m.games_unassigned()}</a>}
  </div>;
}
