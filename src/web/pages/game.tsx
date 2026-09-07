import { useEntries, useEvent, useGame } from "../lib/data";
import { routeHref, type Route } from "../lib/router";
import { GameRow } from "../components/schedule";
import { m } from "../lib/i18n";
import { QueryError, isNotFound } from "../components/query-error";

/** @answers VIEW_GAME_RESULTS, VIEW_MATCH_STATUS */
export function GamePage({ id, goto, spoiler }: { id?: string; goto: (route: Route) => void; spoiler: boolean }) {
  const game = useGame(id, { refetchInterval: 10_000 });
  const event = useEvent(game.data?.eventId);
  const entries = useEntries(game.data?.eventId);
  const g = game.data;
  if (game.error && !g && !isNotFound(game.error)) return <QueryError error={game.error} retry={game.refetch} pending={game.isFetching} />;
  if (id && game.isPending) return <div className="empty">{m.loading()}</div>;
  if (!g) return <div className="empty"><p>{m.game_unavailable()}</p><a href={routeHref({ page: "live" })}>{m.nav_live()}</a></div>;
  const home = entries.data?.registered.find(t => t.teamId === g.homeTeamId);
  const away = entries.data?.registered.find(t => t.teamId === g.awayTeamId);
  const division = home && away && home.divisionId === away.divisionId ? home : undefined;
  return <div className="page-inner game-page">
    <header className="page-header">
    <nav className="crumbs" aria-label={m.nav_event()}>
      <a href={routeHref({ page: "event", id: g.eventId, query: { tab: "games", division: division?.divisionId ?? "" } })}>{event.data?.title ?? m.nav_event()}</a>
      {division && <> · <a href={routeHref({ page: "event", id: g.eventId, query: { tab: "standings", division: division.divisionId ?? "" } })}>{division.division}</a></>}
    </nav>
    <h1>{g.homeTeam} {m.versus()} {g.awayTeam}</h1>
    </header>
    <QueryError error={game.error} retry={game.refetch} pending={game.isFetching} />
    <QueryError error={event.error} retry={event.refetch} pending={event.isFetching} />
    <QueryError error={entries.error} retry={entries.refetch} pending={entries.isFetching} />
    {event.data ? <div className="panel-list"><GameRow game={g} eventId={g.eventId} can={event.data.can} spoiler={spoiler} goto={goto} viewerZone={null} details /></div> : event.isPending ? <p role="status">{m.loading()}</p> : null}
  </div>;
}
