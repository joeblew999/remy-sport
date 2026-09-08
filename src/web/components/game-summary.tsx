import type { ApiGame } from "../../domain/api";
import { useEntries, useEvent } from "../lib/data";
import { useLocale } from "../lib/locale";
import { formatTimeOn } from "../lib/dates";
import { routeHref } from "../lib/router";
import { m } from "../lib/i18n";

/** Shared identity/time/status for every fixture entry point. */
export function GameSummary({ game, details = false, showEvent = false, showStatus = true }: { game: ApiGame; details?: boolean; showEvent?: boolean; showStatus?: boolean }) {
  const { name, label, locale } = useLocale();
  const event = useEvent(showEvent ? game.eventId : undefined);
  const entries = useEntries(game.eventId);
  const home = entries.data?.registered.find(t => t.teamId === game.homeTeamId);
  const away = entries.data?.registered.find(t => t.teamId === game.awayTeamId);
  const division = home && away && home.divisionId === away.divisionId ? home.division : undefined;
  const title = <>{name(game.homeTeamNames)} {m.versus()} {name(game.awayTeamNames)}</>;
  const meta = "mt-1 block w-fit text-sm leading-relaxed text-muted-foreground";
  return <div className="min-w-0 text-sm">
    {details ? <div className="flex flex-wrap gap-2 text-base font-semibold" data-testid="game-team-links">
      <a className="hover:underline" href={routeHref({ page: "team", id: game.homeTeamId })}>{name(game.homeTeamNames)}</a>
      <span className="font-normal text-muted-foreground">{m.versus()}</span>
      <a className="hover:underline" href={routeHref({ page: "team", id: game.awayTeamId })}>{name(game.awayTeamNames)}</a>
    </div> : <a className="block w-fit text-base font-semibold hover:underline" data-testid={`open-game-${game.id}`} href={routeHref({ page: "game", id: game.id })}>{title}</a>}
    {(showEvent || division) && <a className={`${meta} hover:underline`} href={routeHref({ page: "event", id: game.eventId, query: { tab: "games", division: division ? home?.divisionId ?? "" : "" } })}>{[showEvent ? event.data?.title ?? m.nav_event() : null, division].filter(Boolean).join(" · ")}</a>}
    <div className={meta}>
      {formatTimeOn(locale, new Date(game.startsAt), game.timezone ?? "UTC")} · {game.timezone ?? "UTC"}{showStatus && ` · ${label("gameStatuses", game.statusCode)}`}
    </div>
    <a className={`${meta} hover:underline`} href={routeHref({ page: "event", id: game.eventId, query: { tab: "places", venue: game.venueId ?? "" } })}>
      {game.venueNames ? name(game.venueNames) : m.venue_tbc()}
    </a>
  </div>;
}
