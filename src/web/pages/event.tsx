import { useState } from "react";
import { Icon } from "../components/icon";
import { EventSettings } from "../components/event-settings";
import { EventVenues } from "../components/event-venues";
import { EventDivisions } from "../components/event-divisions";
import { EventPlayers } from "../components/event-players";
import { downloadICS } from "../lib/calendar";
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
type EventTab = "overview" | "schedule" | "standings" | "teams" | "players" | "venues" | "divisions" | "rules" | "settings";

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
            color: e.status === "live" ? "var(--live)" : "var(--ink-3)",
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
            <div className="label">{m.venue_count()}</div>
            <div className="value">{e.courts || "—"}</div>
          </div>
          {/* Every cell here is now counted from the tables that hold it.
              Teams, venues and following were hardcoded — a zero, a zero, and
              "284 / parents, coaches, scouts" counting followers of nothing —
              on events that had all three. `subscriptions` had existed the
              whole time; nothing read it.

              The FORMAT cell stays gone: "Single-elim / + 3rd-place game" was
              true of no event in the database, and the model has no knockout
              structure to derive it from. */}
          <div className="stat-cell">
            <div className="label">{m.followers()}</div>
            <div className="value">{e.followers || "—"}</div>
          </div>
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

        {/* Three of these four did nothing. A dead control beside a working
            Follow button is worse than no control: pressing it and getting
            nothing teaches people that the app is broken, and they stop
            trusting the ones that do work. */}
        <div className="event-actions">
          {/* Registration already exists, in full, on the Teams tab. This was a
              second button for it that did not go there. It now does — and only
              when the reader actually has a team that fits, which the server
              answers in `registrable`. */}
          {/* Anything not finished can still take an entry. This used to be
              gated on `status === "open"`, which nothing could ever be. */}
          {e.status !== "closed" && (
            <button
              className="btn accent"
              data-testid="hero-register"
              onClick={() => setTab("teams")}
            >
              {m.register_team()}
            </button>
          )}
          <FollowButton objectTypeCode="EVENT" objectId={e.id} />
          {/* Only where there is a date to put in a diary. An event can exist
              before its dates are fixed, and a file with today's date in it
              would put a wrong entry in somebody's calendar. */}
          {e.startDate && (
            <button
              className="btn"
              data-testid="add-to-calendar"
              onClick={() =>
                downloadICS({
                  id: e.id,
                  title: e.title,
                  startDate: e.startDate,
                  endDate: e.endDate,
                  location: [e.loc, e.city].filter((x) => x && x !== "—").join(", "),
                  url: `${location.origin}/#/event/${e.id}`,
                })
              }
            >
              {m.add_to_calendar()}
            </button>
          )}
          <ShareButton title={e.title} />
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
          // Individuals enter camps and showcases; teams enter tournaments and
          // leagues. That is the PO's grant — `REGISTER_PLAYER_FOR_EVENT` reads
          // `eventTypes: ["CAMP", "SHOWCASE"]` — and offering the tab anywhere
          // else would be a form that answers 403.
          ...((e.type === "CAMP" || e.type === "SHOWCASE"
            ? [["players", m.tab_players()]]
            : []) as [EventTab, string][]),
          ["venues", m.tab_venues()],
          // Tournaments, leagues and showcases are organised by division; a
          // camp is organised by session, which is DEFINE_SESSION_SCHEDULE and
          // a different shape. Same narrowing the model puts on
          // MANAGE_DIVISIONS, so the tab is not offered where the action is
          // not granted.
          ...((e.type === "CAMP" ? [] : [["divisions", m.event_divisions()]]) as [EventTab, string][]),
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
      {tab === "venues" && <EventVenues eventId={e.id}/>}
      {tab === "divisions" && <EventDivisions eventId={e.id} canEdit={e.canEdit}/>}
      {tab === "players" && <EventPlayers eventId={e.id}/>}
      {tab === "rules" && <EventRules event={e}/>}
      {tab === "schedule" && (
        <div className="page-inner">
          <Schedule eventId={e.id} spoiler={spoiler} goto={goto}/>
          <AddFixture eventId={e.id}/>
        </div>
      )}
      {tab === "standings" && <StandingsTable eventId={e.id}/>}
      {tab === "teams" && <div className="page-inner"><Entries eventId={e.id}/></div>}
      {!["overview", "schedule", "standings", "teams", "settings", "venues", "rules", "players"].includes(tab) && (
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
    <button className="btn" data-testid="share" onClick={() => void share()}>
      <Icon name="share"/>
      {copied ? m.share_copied() : m.share()}
    </button>
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
      <div className="dash-card" data-testid="event-rules">
        <div className="fact-row">
          <span className="row-meta">{m.event_format()}</span>
          <span data-testid="event-format">{label("eventFormats", event.formatCode)}</span>
        </div>
        <div className="fact-row">
          <span className="row-meta">{m.event_fiba()}</span>
          {/* A certified event is a fact worth stating and an uncertified one
              is not an absence — most school tournaments are not certified and
              saying nothing would read as "we did not check". */}
          <span data-testid="event-fiba">{event.fibaCertified ? m.yes() : m.no()}</span>
        </div>
      </div>

      <div className="section-h" style={{ marginTop: 24 }}><h2>{m.event_about()}</h2></div>
      <div className="dash-card">
        {event.description ? (
          <p className="event-description" data-testid="event-description">{event.description}</p>
        ) : (
          <div className="empty" data-testid="event-no-details">{m.event_no_details()}</div>
        )}
      </div>
    </div>
  );
}
