import { useState } from "react";
import { Icon } from "../components/icon";
import { EventSettings } from "../components/event-settings";
import { FollowButton } from "../components/follow";
import { Schedule, AddFixture } from "../components/schedule";
import { Entries } from "../components/entries";
import { useEvent, useEvents, useGames, useStandings } from "../lib/data";
import type { Event } from "../data";
import type { Route } from "../lib/router";
import { useLocale } from "../lib/locale";
import { m } from "../lib/i18n";

/**
 * No "bracket" tab.
 *
 * It rendered a sixteen-team knockout — seeds, byes, a final — from a constant
 * in lib/data.tsx, behind a SAMPLE DATA banner. Nothing behind it could ever
 * have been real: a `game` row is two teams, a time and a status, and the
 * Product Owner's model has no round, no seed and no parent match. There is no
 * query that could fill that screen.
 *
 * So it was not an unfinished feature, it was a picture of one. Making it real
 * is a modelling decision for the PO in remy-sport-biz, and when those tables
 * exist the tab comes back reading from them.
 */
type EventTab = "overview" | "schedule" | "standings" | "teams" | "venues" | "rules" | "settings";

interface EventProps {
  id: string | undefined;
  goto: (r: Route) => void;
  /** Hides results, not fixtures — see components/schedule.tsx. */
  spoiler: boolean;
}

export function EventPage({ id, goto, spoiler }: EventProps) {
  const { reference, name } = useLocale();
  const { data: event, isPending: eventLoading } = useEvent(id);
  const { data: allEvents, isPending: listLoading } = useEvents();
  const [tab, setTab] = useState<EventTab>("overview");

  // `#/event` with no id shows whichever event sorts first, as it always has.
  const e = id ? event : allEvents?.[0];

  // The games count, from the games. Cached, and the schedule tab subscribes to
  // the same key — so opening it costs nothing extra.
  const { data: games } = useGames(e?.id);
  const total = games?.games.length ?? 0;
  const played = games?.games.filter((g) => g.homeScore !== null).length ?? 0;

  // Both accessors are async now, so the page has render states it did not
  // have when the data was a module-level constant. Hooks above run
  // unconditionally; only the output below is short-circuited.
  if (id ? eventLoading : listLoading) {
    return <div className="empty">{m.loading_event()}</div>;
  }
  if (!e) {
    return (
      <div className="empty">
        <p>{m.not_found_event()}</p>
        <button onClick={() => goto({ page: "discover" })}>{m.back_to_discover()}</button>
      </div>
    );
  }

  return (
    <>
      <div className="event-hero">
        <div className="meta-bar">
          <button onClick={() => goto({ page: "discover" })} className="crumbs" style={{ background: "transparent", border: "none", padding: 0, fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}>← {m.nav_discover()}</button>
          <span className={`type ${e.type.toLowerCase()}`} style={{
            display: "inline-flex", padding: "3px 8px",
            fontFamily: "IBM Plex Mono, monospace", fontSize: 10, letterSpacing: "0.1em",
            border: "1px solid var(--ink)", textTransform: "uppercase",
            background: e.type === "TOURNAMENT" ? "var(--ink)" : "transparent",
            color: e.type === "TOURNAMENT" ? "var(--paper)" : "var(--ink)",
            borderColor: e.type === "SHOWCASE" ? "var(--accent)" : "var(--ink)",
          }}>{name(reference?.eventTypes.find((t) => t.code === e.type)?.names, e.type)}</span>
          <span className={`status ${e.status}`} style={{
            fontFamily: "IBM Plex Mono, monospace", fontSize: 11,
            letterSpacing: "0.06em", textTransform: "uppercase",
            display: "inline-flex", alignItems: "center", gap: 6,
            color: e.status === "live" ? "var(--live)" : (e.status === "open" ? "var(--good)" : "var(--ink-3)"),
            fontWeight: 500,
          }}>
            {e.status === "live" && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--live)", display: "inline-block" }}/>}
            {e.statusLabel}
          </span>
        </div>
        <h1>
          {/* `title` is already in the reader's language. The em-dash split is
              a typographic flourish on the English form; a title without one
              simply renders whole. */}
          <>{e.title.split(" — ")[0]}{e.title.includes(" — ") && <em>— {e.title.split(" — ")[1]}</em>}</>
        </h1>
        <div className="tagline">{e.date} · {e.loc} · {e.city} · {e.div}</div>
        <div className="tagline">{m.organised_by({ name: e.organizer })}</div>

        <div className="event-stats">
          <div className="stat-cell">
            <div className="label">{m.teams()}</div>
            <div className="value">{e.teams || "—"}</div>
          </div>
          <div className="stat-cell">
            <div className="label">{m.courts()}</div>
            <div className="value">{e.courts || "—"}</div>
          </div>
          {/* Real, from the games endpoint. `teams` and `courts` above are still
              honest zeroes — no endpoint counts them yet — and render as "—"
              rather than as a number nobody computed.

              The FORMAT and FOLLOWING cells that sat here are gone: "Single-elim
              / + 3rd-place game" was true of no event in the database, and "284
              / parents, coaches, scouts" counted followers of nothing. The model
              has a `subscriptions` table, so the second can come back the day an
              endpoint reads it. */}
          <div className="stat-cell">
            <div className="label">{m.games()}</div>
            <div className="value">
              {played > 0 ? <><em>{played}</em> / {total}</> : (total || "—")}
            </div>
            {played > 0 && played < total && (
              <div className="sub">{m.games_remaining({ count: total - played })}</div>
            )}
          </div>
        </div>

        <div className="event-actions">
          {e.status === "open" && <button className="btn accent">{m.register_team()}</button>}
          <FollowButton objectTypeCode="EVENT" objectId={e.id} />
          <button className="btn">{m.add_to_calendar()}</button>
          <button className="btn"><Icon name="share"/>{m.share()}</button>
        </div>
      </div>

      <div className="detail-tabs">
        {/* Labels are messages: these were English literals, so the tab strip
            stayed in English on a Thai page while everything under it
            translated. */}
        {([
          ["overview", m.tab_overview()],
          ["schedule", m.schedule()],
          ["standings", m.nav_standings()],
          ["teams", m.tab_teams()],
          ["venues", m.tab_venues()],
          ["rules", m.tab_rules()],
          // Only for someone the model says may edit this event. A tab everyone
          // can see and only some can use is a 403 with extra steps, and it
          // teaches the other readers that the app is broken.
          ...(e.canEdit ? ([["settings", m.tab_settings()]] as [EventTab, string][]) : []),
        ] as [EventTab, string][]).map(([tabId, label]) => (
          <button key={tabId} data-testid={`tab-${tabId}`} className={`tab ${tab === tabId ? "active" : ""}`} onClick={() => setTab(tabId)}>{label}</button>
        ))}
      </div>

      {tab === "overview" && <EventOverview e={e} goto={goto}/>}
      {tab === "settings" && e.canEdit && <EventSettings event={e}/>}
      {tab === "schedule" && (
        <div className="page-inner">
          <Schedule eventId={e.id} spoiler={spoiler} goto={goto}/>
          <AddFixture eventId={e.id}/>
        </div>
      )}
      {tab === "standings" && <StandingsTable eventId={e.id}/>}
      {tab === "teams" && <div className="page-inner"><Entries eventId={e.id}/></div>}
      {!["overview", "schedule", "standings", "teams", "settings"].includes(tab) && (
        <div className="page-inner"><div className="empty">{m.tab_not_built()}</div></div>
      )}
    </>
  );
}

interface OverviewProps { e: Event; goto: (r: Route) => void }

/**
 * The event at a glance, from the event's own games.
 *
 * Three of the four sections here were invented. A live game with a quarter, a
 * clock and a court. A next game with a countdown. And "Top performers today" —
 * four players with names, schools and stat lines (`24 PTS · 8 AST · 3 STL`)
 * that were typed into this file, on a platform with no player statistics of
 * any kind. Only the standings were real.
 *
 * The performers section is gone rather than labelled: there is no `points`,
 * `assists` or `steals` anywhere in the Product Owner's model, so nothing could
 * have filled it. A section that cannot be made real is not an unfinished
 * feature, it is a picture of one, and it made the whole page untrustworthy —
 * a reader with no way to tell which numbers were real has to assume none are.
 *
 * The rest reads `games.list` for this event, which is the same source the
 * Schedule tab uses. Live, next and recent are three questions about one list.
 */
function EventOverview({ e, goto }: OverviewProps) {
  const { data: standings } = useStandings(e.id);
  const { data: gameData, isPending } = useGames(e.id);
  const games = gameData?.games ?? [];

  // In play now. `HALF_TIME` counts: the game has not finished and somebody
  // watching wants to see it resume.
  const live = games.filter((g) => g.statusCode === "LIVE" || g.statusCode === "HALF_TIME");
  // The soonest game that has not started. `games.list` returns them in
  // chronological order, so the first match is the next one.
  const next = games.find((g) => g.statusCode === "SCHEDULED");
  // Finished, most recently first — the reverse of the schedule's order,
  // because a result list is read backwards from now.
  const finished = games.filter((g) => g.statusCode === "FINISHED").reverse().slice(0, 6);

  return (
    <div className="page-inner">
      <div className="dash-grid">
        <div>
          <div className="section-h">
            <h2>{m.live_and_next()}</h2>
            <a className="more" onClick={() => goto({ page: "live" })} style={{ cursor: "pointer" }}>
              {m.view_schedule()}
            </a>
          </div>

          <div className="dash-card" data-testid="event-live">
            {isPending && <div className="empty">{m.loading()}</div>}
            {!isPending && live.length === 0 && !next && (
              <div className="empty" data-testid="event-no-games">{m.event_no_games()}</div>
            )}

            {live.map((g) => (
              <button
                key={g.id}
                className="row-button"
                data-testid={`event-live-${g.id}`}
                onClick={() => goto(g.isBroadcasting ? { page: "watch", id: g.id } : { page: "live" })}
              >
                <div className="row-title">
                  {g.homeTeam} {m.versus()} {g.awayTeam}
                  {g.homeScore !== null && g.awayScore !== null
                    ? `  ${g.homeScore}–${g.awayScore}`
                    : ""}
                </div>
                <div className="row-meta" style={{ color: "var(--live)" }}>
                  {g.statusLabel}
                  {g.venue ? ` · ${g.venue}` : ""}
                  {/* Only where a camera is actually pointed at it. */}
                  {g.isBroadcasting ? ` · ${m.video_watch()}` : ""}
                </div>
              </button>
            ))}

            {next && (
              <button
                key={next.id}
                className="row-button"
                data-testid={`event-next-${next.id}`}
                onClick={() => goto({ page: "live" })}
              >
                <div className="row-title">
                  {next.homeTeam} {m.versus()} {next.awayTeam}
                </div>
                <div className="row-meta">
                  {m.event_next_up()}
                  {next.venue ? ` · ${next.venue}` : ""}
                </div>
              </button>
            )}
          </div>
        </div>

        <div>
          <div className="section-h"><h2>{m.standings()}</h2></div>
          <div className="dash-card">
            <div className="standing-row head">
              <span></span><span>{m.team()}</span><span>{m.col_won()}</span><span>{m.col_lost()}</span><span></span><span>{m.col_points()}</span>
            </div>
            {(standings ?? []).slice(0, 6).map(s => (
              <div key={s.teamId} className="standing-row">
                <span className="rank">#{s.rank}</span>
                <span className="team">{s.team}</span>
                <span className="num">{s.won}</span>
                <span className="num">{s.lost}</span>
                <span className="num">{s.pointsDiff > 0 ? "+" : ""}{s.pointsDiff}</span>
                <span className="pts">{s.leaguePoints}</span>
              </div>
            ))}
          </div>

          <div className="section-h"><h2>{m.recent_results()}</h2></div>
          <div className="dash-card" data-testid="event-results">
            {!isPending && finished.length === 0 && (
              <div className="empty" data-testid="event-no-results">{m.event_no_results()}</div>
            )}
            {finished.map((g) => (
              <div key={g.id} className="result-row" data-testid={`event-result-${g.id}`}>
                <div>
                  <div className="row-title">{g.homeTeam}</div>
                  <div className="row-title" style={{ color: "var(--ink-3)" }}>{g.awayTeam}</div>
                </div>
                <div className="result-score">
                  <div className={(g.homeScore ?? 0) >= (g.awayScore ?? 0) ? "won" : ""}>{g.homeScore ?? "—"}</div>
                  <div className={(g.awayScore ?? 0) > (g.homeScore ?? 0) ? "won" : ""}>{g.awayScore ?? "—"}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The league table, from `/api/standings`.
 *
 * Was eight hardcoded schools with invented records — Bangkok Christian 5–0,
 * Saint Gabriel's 4–1 — rendered on the event page and `#/standings` since the
 * SPA was built. Every number is derived from the games now.
 */
export function StandingsTable({ eventId }: { eventId: string | undefined }) {
  const { data, isPending } = useStandings(eventId);

  if (isPending) return <div className="page-inner"><div className="empty">{m.loading()}</div></div>;
  if (!data?.length) {
    return (
      <div className="page-inner">
        <div className="empty" data-testid="standings-empty">{m.standings_empty()}</div>
      </div>
    );
  }

  return (
    <div className="page-inner">
      <div className="dash-card" data-testid="standings">
        <div className="standing-row full head">
          <span></span><span>{m.team()}</span><span>{m.col_won()}</span><span>{m.col_lost()}</span>
          <span>{m.col_points_for()}</span><span>{m.col_points_against()}</span><span>±</span><span>{m.col_points()}</span>
        </div>
        {data.map((s) => (
          <div key={s.teamId} className="standing-row full" data-testid={`standing-${s.teamId}`}>
            <span className="rank">#{s.rank}</span>
            <span className="team">{s.team}</span>
            <span className="num">{s.won}</span>
            <span className="num">{s.lost}</span>
            <span className="num">{s.pointsFor}</span>
            <span className="num">{s.pointsAgainst}</span>
            <span className="num" style={{ color: s.pointsDiff > 0 ? "var(--good)" : "var(--ink-3)" }}>
              {s.pointsDiff > 0 ? "+" : ""}{s.pointsDiff}
            </span>
            <span className="pts">{s.leaguePoints}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

