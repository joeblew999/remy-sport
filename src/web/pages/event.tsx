import { useState } from "react";
import { Icon } from "../components/icon";
import { Schedule } from "../components/schedule";
import { useEvent, useEvents, useGames, useLiveGame, useStandings } from "../lib/data";
import type { Event } from "../data";
import type { Route } from "../lib/router";
import { BracketView } from "./bracket";
import { useLocale } from "../lib/locale";
import { m } from "../lib/i18n";

type EventTab = "overview" | "bracket" | "schedule" | "standings" | "teams" | "venues" | "rules";

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
  const total = games?.length ?? 0;
  const played = games?.filter((g) => g.homeScore !== null).length ?? 0;

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
        <button onClick={() => goto({ page: "discover" })}>← Back to discover</button>
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
        <div className="tagline thai" style={{ fontSize: 14 }}>จัดโดย {e.organizer}</div>

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
          <button className="btn primary"><Icon name="follow"/>{m.follow_event()}</button>
          <button className="btn">{m.add_to_calendar()}</button>
          <button className="btn"><Icon name="share"/>{m.share()}</button>
        </div>
      </div>

      <div className="detail-tabs">
        {([
          ["overview", "Overview"],
          ["bracket", "Bracket"],
          ["schedule", "Schedule"],
          ["standings", "Standings"],
          ["teams", "Teams"],
          ["venues", "Venues"],
          ["rules", "Rules & info"],
        ] as [EventTab, string][]).map(([tabId, label]) => (
          <button key={tabId} className={`tab ${tab === tabId ? "active" : ""}`} onClick={() => setTab(tabId)}>{label}</button>
        ))}
      </div>

      {tab === "overview" && <EventOverview e={e} goto={goto}/>}
      {tab === "bracket" && <BracketView goto={goto}/>}
      {tab === "schedule" && <div className="page-inner"><Schedule eventId={e.id} spoiler={spoiler}/></div>}
      {tab === "standings" && <StandingsTable eventId={e.id}/>}
      {!["overview", "bracket", "schedule", "standings"].includes(tab) && (
        <div className="page-inner"><div className="empty">{tab.toUpperCase()} view — not part of this hi-fi pass.</div></div>
      )}
    </>
  );
}

interface OverviewProps { e: Event; goto: (r: Route) => void }

function EventOverview({ e, goto }: OverviewProps) {
  const G = useLiveGame();
  const { data: standings } = useStandings(e.id);
  const performers = [
    { name: "Phongphan S.", team: "Saint Gabriel's", line: "24 PTS · 8 AST · 3 STL" },
    { name: "Krit T.", team: "Assumption", line: "21 PTS · 6 REB · 4 3PM" },
    { name: "Boonyarit T.", team: "Saint Gabriel's", line: "18 PTS · 11 REB · 2 BLK" },
    { name: "Tanawat W.", team: "Bangkok Christian", line: "16 PTS · 9 AST · 2 STL" },
  ];
  const recents: [string, string, string, string][] = [
    ["BKC", "SJS", "68", "51"],
    ["SGS", "SKL", "71", "54"],
    ["ASC", "RIS", "65", "58"],
    ["TUS", "WCR", "67", "50"],
  ];
  return (
    <div className="page-inner">
      <div className="dash-grid">
        <div>
          <div className="section-h"><h2>{m.live_and_next()}</h2><a className="more">VIEW SCHEDULE →</a></div>
          <div className="dash-card" style={{ borderColor: "var(--live)", borderWidth: 1.5 }}>
            <div className="head" style={{ color: "var(--live)" }}>
              <span><span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--live)", marginRight: 6, animation: "pulse 1.4s infinite" }}/>LIVE · {G.quarter} {G.clock} · COURT B</span>
              <a className="more" onClick={() => goto({ page: "live" })} style={{ cursor: "pointer", color: "var(--ink)" }}>OPEN →</a>
            </div>
            <div className="next-game">
              <div className="team">
                <div className="name">{G.teamA.name}</div>
                <div className="meta">SEED {G.teamA.seed} · {G.teamA.record}</div>
              </div>
              <div className="when">
                <div className="countdown" style={{ color: "var(--live)", fontVariantNumeric: "tabular-nums" }}>
                  {G.quarters.a.reduce<number>((acc, b) => acc + (b ?? 0), 0)}–{G.quarters.b.reduce<number>((acc, b) => acc + (b ?? 0), 0)}
                </div>
                <div className="label">QUARTERFINAL 2</div>
              </div>
              <div className="team r">
                <div className="name">{G.teamB.name}</div>
                <div className="meta">SEED {G.teamB.seed} · {G.teamB.record}</div>
              </div>
            </div>
          </div>

          <div className="dash-card" style={{ marginTop: 12 }}>
            <div className="head"><span>NEXT · 14:00 · COURT A</span></div>
            <div className="next-game">
              <div className="team">
                <div className="name">Triam Udom</div>
                <div className="meta">SEED 3 · 1–0</div>
              </div>
              <div className="when">
                <div className="countdown">1:18</div>
                <div className="label">UNTIL TIPOFF</div>
              </div>
              <div className="team r">
                <div className="name">Bangkok Patana</div>
                <div className="meta">SEED 6 · 1–0</div>
              </div>
            </div>
          </div>

          <div className="section-h"><h2>{m.top_performers_today()}</h2><a className="more">ALL STATS →</a></div>
          <div className="dash-card">
            {performers.map((p, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "32px 1fr auto", gap: 12, padding: "12px 18px", borderBottom: "1px solid var(--rule)", alignItems: "center" }}>
                <div className="avatar" style={{ width: 32, height: 32, fontSize: 11 }}>{p.name.split(" ").map(x => x[0]).join("")}</div>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{p.name}</div>
                  <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.06em", textTransform: "uppercase" }}>{p.team}</div>
                </div>
                <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 12, color: "var(--ink-2)", letterSpacing: "0.04em" }}>{p.line}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="section-h"><h2>{m.standings()}</h2><a className="more">FULL TABLE →</a></div>
          <div className="dash-card">
            <div className="standing-row head">
              <span></span><span>{m.team()}</span><span>W</span><span>L</span><span></span><span>PTS</span>
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
          <div className="dash-card">
            {recents.map((r, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 50px 50px", padding: "12px 18px", borderBottom: "1px solid var(--rule)", alignItems: "center" }}>
                <div style={{ fontSize: 13 }}>
                  <div style={{ fontWeight: 600 }}>{r[0]}</div>
                  <div style={{ color: "var(--ink-3)", marginTop: 2 }}>{r[1]}</div>
                </div>
                <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 18, textAlign: "right", color: "var(--accent)" }}>{r[2]}</div>
                <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 500, fontSize: 18, textAlign: "right", color: "var(--ink-3)" }}>{r[3]}</div>
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
  const cols = "40px 1fr 50px 50px 70px 70px 70px 60px";

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
        <div className="standing-row head" style={{ gridTemplateColumns: cols }}>
          <span></span><span>{m.team()}</span><span>W</span><span>L</span>
          <span>PF</span><span>PA</span><span>±</span><span>PTS</span>
        </div>
        {data.map((s) => (
          <div key={s.teamId} className="standing-row" style={{ gridTemplateColumns: cols }} data-testid={`standing-${s.teamId}`}>
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

