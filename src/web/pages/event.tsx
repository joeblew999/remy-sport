import { QueryError, isNotFound } from "../components/query-error";
import { useState } from "react";
import { Icon } from "../components/icon";
import { EventSettings } from "../components/event-settings";
import { EventVenues } from "../components/event-venues";
import { EventDivisions } from "../components/event-divisions";
import { EventSessions } from "../components/event-sessions";
import { EventPlayers } from "../components/event-players";
import { downloadICS } from "../lib/calendar";
import { FollowButton } from "../components/follow";
import { Schedule, AddFixture } from "../components/schedule";
import { Entries } from "../components/entries";
import { useEntries, useEvent, useGames, useStandings } from "../lib/data";
import type { Event } from "../data";
import { routeHref, type Route } from "../lib/router";
import { useLocale } from "../lib/locale";
import { m } from "../lib/i18n";
import { CourtBoard } from "../components/court-board";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

type EventTab = "games" | "standings" | "teams" | "players" | "places" | "sessions" | "about" | "manage";

/** @answers VIEW_EVENT, VIEW_FIXTURE_SCHEDULE, VIEW_GAME_RESULTS, VIEW_STANDINGS, VIEW_RANK_MOVEMENT, VIEW_SEASON_RECORDS */
export function EventPage({ id, goto, spoiler, query = {}, setParam }: {
  id?: string; goto: (r: Route) => void; spoiler: boolean;
  query?: Record<string, string>; setParam: (key: string, value: string | null) => void;
}) {
  const eventQuery = useEvent(id);
  const { data: e, isPending } = eventQuery;
  const entries = useEntries(id);
  const { data: games } = useGames(id);
  if (eventQuery.error && !e && !isNotFound(eventQuery.error)) return <QueryError error={eventQuery.error} retry={eventQuery.refetch} pending={eventQuery.isFetching} />;
  if (id && isPending) return <div className="empty">{m.loading_event()}</div>;
  if (!id || !e) return <div className="empty"><p>{m.not_found_event()}</p><a href={routeHref({ page: "discover" })}>{m.back_to_discover()}</a></div>;
  const camp = e.typeCode === "CAMP";
  const canManage = e.can.EDIT_EVENT || e.can.MANAGE_DIVISIONS;
  const tabs: [EventTab, string][] = [
    ...(camp ? [["sessions", m.event_sessions()]] : [["games", m.games()], ["standings", m.nav_standings()], ["teams", m.tab_teams()]]) as [EventTab, string][],
    ...((camp || e.typeCode === "SHOWCASE") ? [["players", m.tab_players()]] : []) as [EventTab, string][],
    ["places", m.event_places()], ["about", m.event_about()],
    ...(canManage ? [["manage", m.event_manage()]] : []) as [EventTab, string][],
  ];
  const aliases: Record<string, EventTab> = { overview: "games", schedule: "games", courts: "places", venues: "places", rules: "about", divisions: "manage", settings: "manage" };
  const requested = aliases[query.tab ?? ""] ?? query.tab;
  const tab = tabs.find(([key]) => key === requested)?.[0] ?? tabs[0]![0];
  const division = entries.data?.divisions.find(d => d.id === query.division)?.id;
  const divisionInvalid = !!query.division && !!entries.data && !division;
  const total = games?.games.length ?? 0;
  const played = games?.games.filter(g => g.statusCode === "FINISHED").length ?? 0;
  const changeTab = (tab: EventTab) => setParam("tab", tab);
  return <div className="event-page">
    <div className="event-hero">
      <div className="meta-bar"><a className="crumbs" href={routeHref({ page: "discover" })}>← {m.nav_discover()}</a><span className="badge badge-outline">{e.statusLabel}</span></div>
      <h1>{e.title}</h1>
      <div className="tagline">{e.date} · {e.venue} · {e.city}</div>
      <div className="event-actions">
        {e.status !== "closed" && <Button data-testid="hero-register" onClick={() => changeTab(camp || e.typeCode === "SHOWCASE" ? "players" : "teams")}>{camp || e.typeCode === "SHOWCASE" ? m.tab_players() : m.register_team()}</Button>}
        <FollowButton objectTypeCode="EVENT" objectId={e.id}/>
        {e.startDate && <Button variant="outline" data-testid="add-to-calendar" onClick={() => downloadICS({ id: e.id, title: e.title, startDate: e.startDate, endDate: e.endDate, location: [e.venue, e.city].join(", "), url: `${location.origin}/#/event/${e.id}` })}>{m.add_to_calendar()}</Button>}
        <ShareButton title={e.title}/>
      </div>
    </div>
    <nav className="detail-tabs" aria-label={m.nav_event()}>
      {tabs.map(([key, title]) => <a key={key} className={`tab ${tab === key ? "active" : ""}`} data-testid={`tab-${key}`} aria-current={tab === key ? "page" : undefined} href={routeHref({ page: "event", id: e.id, query: { ...query, tab: key } })}>{title}</a>)}
    </nav>
    {!camp && ["games", "standings", "teams"].includes(tab) && <div className="event-filters">
      <label>{m.division()} <NativeSelect data-testid="event-division" value={division ?? ""} onChange={event => setParam("division", event.target.value || null)}>
        <NativeSelectOption value="">{m.all_divisions()}</NativeSelectOption>
        {entries.data?.divisions.map(d => <NativeSelectOption key={d.id} value={d.id}>{d.division}</NativeSelectOption>)}
      </NativeSelect></label>
      {divisionInvalid && <span role="status">{m.invalid_division()}</span>}
    </div>}
    {tab === "games" && <div className="page-inner">
      {total > 0 && <p className="muted" data-testid="event-progress">{m.event_progress({ played, total })}</p>}
      <Schedule eventId={e.id} can={e.can} spoiler={spoiler} goto={goto} divisionId={division}/>
      <AddFixture eventId={e.id} can={e.can} timezone={e.timezone}/>
    </div>}
    {tab === "standings" && <StandingsTable eventId={e.id} divisionId={division} spoiler={spoiler}/>}
    {tab === "teams" && <div className="page-inner"><Entries eventId={e.id} divisionId={division}/></div>}
    {tab === "players" && <EventPlayers eventId={e.id}/>}
    {tab === "sessions" && <EventSessions eventId={e.id} can={e.can} timezone={e.timezone}/>}
    {tab === "places" && <div className="event-places"><CourtBoard eventId={e.id} spoiler={spoiler} courtId={query.court}/><EventVenues eventId={e.id} venueId={query.venue}/></div>}
    {tab === "about" && <>
      <div className="page-inner"><p>{m.organised_by({ name: e.organizer })}</p><p>{e.division} · {m.teams()}: {e.teamCount} · {m.venue_count()}: {e.venueCount} · {m.followers()}: {e.followerCount}</p></div>
      <EventRules event={e}/>
    </>}
    {tab === "manage" && <>
      {!camp && e.can.MANAGE_DIVISIONS && <EventDivisions eventId={e.id} can={e.can}/>}
      {e.can.EDIT_EVENT && <EventSettings event={e}/>}
    </>}
  </div>;
}

/** Rank values are computed inside divisions by the API, never renumbered by a UI filter. */
export function StandingsTable({ eventId, divisionId, spoiler = false }: { eventId?: string; divisionId?: string; spoiler?: boolean }) {
  const { data, isPending } = useStandings(eventId);
  if (isPending) return <div className="empty">{m.loading()}</div>;
  const rows = (data ?? []).filter(s => !divisionId || s.divisionId === divisionId);
  if (!rows.length) return <div className="page-inner"><div className="empty" data-testid="standings-empty">{m.standings_empty()}</div></div>;
  if (spoiler) return <div className="page-inner">{m.spoiler_hidden()}</div>;
  const groups = Map.groupBy(rows, row => row.divisionId);
  return <div className="page-inner" data-testid="standings">
    {[...groups].map(([key, group]) => <section key={key ?? "unassigned"} className="game-group">
      <h2>{group[0]?.division ?? m.division_unassigned()}</h2>
      <div className="table-scroll"><table className="competition-table">
        <thead><tr><th>{m.rank_label()}</th><th>{m.team()}</th><th>{m.col_won()}</th><th>{m.col_lost()}</th><th>{m.col_points_for()}</th><th>{m.col_points_against()}</th><th>±</th><th>{m.col_points()}</th></tr></thead>
        <tbody>{group.map(s => <tr key={s.teamId} data-testid={`standing-${s.teamId}`}>
          <td>#{s.rank}{s.movement !== null && s.movement !== 0 && <span data-testid={`movement-${s.teamId}`} title={m.rank_movement_note()}>{s.movement > 0 ? " ▲" : " ▼"}{Math.abs(s.movement)}</span>}</td>
          <td><a href={routeHref({ page: "team", id: s.teamId })}>{s.team}</a></td>
          <td>{s.won}</td><td>{s.lost}</td><td>{s.pointsFor}</td><td>{s.pointsAgainst}</td><td>{s.pointsDiff > 0 ? "+" : ""}{s.pointsDiff}</td><td>{s.leaguePoints}</td>
        </tr>)}</tbody>
      </table></div>
    </section>)}
    <p className="muted small">{m.rank_movement_note()}</p>
  </div>;
}

/**
 * Share this page.
 *
 * `navigator.share` where the browser has it — on a phone that is the system
 * sheet, which is what somebody means when they press Share — and the clipboard
 * everywhere else, with a word to say it worked. A copy with no feedback is
 * indistinguishable from a button that does nothing, which is what this
 * replaced.
 *
 * An `AbortError` is the person changing their mind, not a failure, so the
 * catch is silent rather than apologetic.
 */
function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Dismissed, or a clipboard the browser will not give us. Neither is
      // worth an error message about a link.
    }
  };

  return (
    <Button variant="outline" data-testid="share" onClick={() => void share()}>
      <Icon name="share"/>
      {copied ? m.share_copied() : m.share()}
    </Button>
  );
}

/**
 * The terms the competition is played under.
 *
 * This tab said "not built yet" while three columns on `event` said exactly
 * this and were rendered nowhere at all: `formatCode` — whether it is 5-on-5 or
 * 3x3, which changes what a team even is — `isFibaCertified`, which decides
 * whether a result counts for anything outside this app, and `description`,
 * which is what the organiser wrote about their own tournament.
 *
 * Nothing here needed building. The page had never asked for any of it.
 *
 * The format reads from the reference vocabulary, so "5-on-5" and "5 ต่อ 5" are
 * the same row rather than two strings in a component.
 */
function EventRules({ event }: { event: Event }) {
  const { label } = useLocale();
  return (
    <div className="page-inner">
      <div className="panel-list" data-testid="event-rules">
        <div className="fact-row">
          <span className="row-meta">{m.event_format()}</span>
          <span data-testid="event-format">{label("eventFormats", event.formatCode)}</span>
        </div>
        <div className="fact-row">
          <span className="row-meta">{m.event_fiba()}</span>
          {/* A certified event is a fact worth stating and an uncertified one
              is not an absence — most school tournaments are not certified and
              saying nothing would read as "we did not check". */}
          <span data-testid="event-fiba">{event.isFibaCertified ? m.yes() : m.no()}</span>
        </div>
      </div>

      <div className="section-h" style={{ marginTop: 24 }}><h2>{m.event_about()}</h2></div>
      <div className="panel-list">
        {event.description ? (
          <p className="event-description" data-testid="event-description">{event.description}</p>
        ) : (
          <div className="empty" data-testid="event-no-details">{m.event_no_details()}</div>
        )}
      </div>
    </div>
  );
}
