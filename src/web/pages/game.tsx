import { useEntries, useEvent, useGame } from "../lib/data";
import { routeHref, type Route } from "../lib/router";
import { GameRow } from "../components/schedule";
import { PageHeader, PageInner, type Crumb } from "../components/page";
import { EmptyState, Loading } from "../components/states";
import { m } from "../lib/i18n";
import { QueryError, isNotFound } from "../components/query-error";
import { ItemGroup } from "@/components/ui/item";

/** @answers VIEW_GAME_RESULTS, VIEW_MATCH_STATUS */
export function GamePage({ id, goto, spoiler }: { id?: string; goto: (route: Route) => void; spoiler: boolean }) {
  const game = useGame(id, { refetchInterval: 10_000 });
  const event = useEvent(game.data?.eventId);
  const entries = useEntries(game.data?.eventId);
  const g = game.data;
  if (game.error && !g && !isNotFound(game.error)) return <PageInner><QueryError error={game.error} retry={game.refetch} pending={game.isFetching} /></PageInner>;
  if (id && game.isPending) return <PageInner><Loading /></PageInner>;
  if (!g) return <PageInner><EmptyState data-testid="not-found"><p>{m.game_unavailable()}</p><a href={routeHref({ page: "live" })}>{m.nav_live()}</a></EmptyState></PageInner>;
  const home = entries.data?.registered.find(t => t.teamId === g.homeTeamId);
  const away = entries.data?.registered.find(t => t.teamId === g.awayTeamId);
  const division = home && away && home.divisionId === away.divisionId ? home : undefined;
  const crumbs: Crumb[] = [
    { label: event.data?.title ?? m.nav_event(), href: routeHref({ page: "event", id: g.eventId, query: { tab: "games", division: division?.divisionId ?? "" } }) },
    ...(division ? [{ label: division.division, href: routeHref({ page: "event", id: g.eventId, query: { tab: "standings", division: division.divisionId ?? "" } }) }] : []),
  ];
  return <div data-testid="game-page">
    <PageHeader crumbs={crumbs} title={<>{g.homeTeam} {m.versus()} {g.awayTeam}</>} />
    <PageInner className="flex flex-col gap-4">
      <QueryError error={game.error} retry={game.refetch} pending={game.isFetching} />
      <QueryError error={event.error} retry={event.refetch} pending={event.isFetching} />
      <QueryError error={entries.error} retry={entries.refetch} pending={entries.isFetching} />
      {event.data
        ? <ItemGroup className="overflow-hidden rounded-xl border"><GameRow game={g} eventId={g.eventId} can={event.data.can} spoiler={spoiler} goto={goto} viewerZone={null} details /></ItemGroup>
        : event.isPending ? <p role="status">{m.loading()}</p> : null}
    </PageInner>
  </div>;
}
