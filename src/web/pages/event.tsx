import { useState } from "react";
import { Icon } from "../components/icon";
import { useEvent, useEvents, useLiveGame, useStandings } from "../lib/data";
import type { Event } from "../data";
import type { Route } from "../lib/router";
import type { Lang } from "../lib/i18n";
import { BracketView } from "./bracket";

type EventTab = "overview" | "bracket" | "schedule" | "standings" | "teams" | "venues" | "rules";

interface EventProps {
  id: string | undefined;
  goto: (r: Route) => void;
  lang: Lang;
}

export function EventPage({ id, goto, lang }: EventProps) {
  const allEvents = useEvents();
  const e = useEvent(id) ?? allEvents[0];
  const [tab, setTab] = useState<EventTab>("overview");

  return (
    <>
      <div className="event-hero">
        <div className="meta-bar">
          <button onClick={() => goto({ page: "discover" })} className="crumbs" style={{ background: "transparent", border: "none", padding: 0, fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}>← DISCOVER</button>
          <span className={`type ${e.type}`} style={{
            display: "inline-flex", padding: "3px 8px",
            fontFamily: "IBM Plex Mono, monospace", fontSize: 10, letterSpacing: "0.1em",
            border: "1px solid var(--ink)", textTransform: "uppercase",
            background: e.type === "tournament" ? "var(--ink)" : "transparent",
            color: e.type === "tournament" ? "var(--paper)" : "var(--ink)",
            borderColor: e.type === "showcase" ? "var(--accent)" : "var(--ink)",
          }}>{e.type}</span>
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
          {lang === "TH" && e.titleTh ? e.titleTh : (
            <>{e.title.split(" — ")[0]} <em>— {e.title.split(" — ")[1] || e.div}</em></>
          )}
        </h1>
        <div className="tagline">{e.date} · {e.loc} · {e.city} · {e.div}</div>
        <div className="tagline thai" style={{ fontSize: 14 }}>จัดโดย {e.organizer}</div>

        <div className="event-stats">
          <div className="stat-cell">
            <div className="label">Teams</div>
            <div className="value">{e.teams || "—"}</div>
          </div>
          <div className="stat-cell">
            <div className="label">Courts</div>
            <div className="value">{e.courts || "—"}</div>
          </div>
          <div className="stat-cell">
            <div className="label">Games</div>
            <div className="value">
              {e.gamesPlayed > 0 ? <><em>{e.gamesPlayed}</em> / {e.games}</> : (e.games || "—")}
            </div>
            {e.gamesPlayed > 0 && <div className="sub">{e.games - e.gamesPlayed} remaining</div>}
          </div>
          <div className="stat-cell">
            <div className="label">Format</div>
            <div className="value" style={{ fontSize: 18 }}>Single-elim</div>
            <div className="sub">+ 3rd-place game</div>
          </div>
          <div className="stat-cell">
            <div className="label">Following</div>
            <div className="value" style={{ fontSize: 18 }}>284</div>
            <div className="sub">parents, coaches, scouts</div>
          </div>
        </div>

        <div className="event-actions">
          {e.status === "open" && <button className="btn accent">Register team</button>}
          <button className="btn primary"><Icon name="follow"/>Follow event</button>
          <button className="btn">Add to calendar</button>
          <button className="btn"><Icon name="share"/>Share</button>
        </div>
      </div>

      <div className="detail-tabs">
        {([
          ["overview", "Overview"],
          ["bracket", "Bracket"],
          ["schedule", "Schedule"],
          ["standings", "Standings"],
          ["teams", "Teams (16)"],
          ["venues", "Venues"],
          ["rules", "Rules & info"],
        ] as [EventTab, string][]).map(([tabId, label]) => (
          <button key={tabId} className={`tab ${tab === tabId ? "active" : ""}`} onClick={() => setTab(tabId)}>{label}</button>
        ))}
      </div>

      {tab === "overview" && <EventOverview e={e} goto={goto}/>}
      {tab === "bracket" && <BracketView goto={goto}/>}
      {tab === "schedule" && <SchedulePlaceholder/>}
      {tab === "standings" && <StandingsTable/>}
      {!["overview", "bracket", "schedule", "standings"].includes(tab) && (
        <div className="page-inner"><div className="empty">{tab.toUpperCase()} view — not part of this hi-fi pass.</div></div>
      )}
    </>
  );
}

interface OverviewProps { e: Event; goto: (r: Route) => void }

function EventOverview({ e: _e, goto }: OverviewProps) {
  const G = useLiveGame();
  const standings = useStandings();
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
          <div className="section-h"><h2>Live & next up</h2><a className="more">VIEW SCHEDULE →</a></div>
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

          <div className="section-h"><h2>Top performers · today</h2><a className="more">ALL STATS →</a></div>
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
          <div className="section-h"><h2>Standings</h2><a className="more">FULL TABLE →</a></div>
          <div className="dash-card">
            <div className="standing-row head">
              <span></span><span>Team</span><span>W</span><span>L</span><span></span><span>PTS</span>
            </div>
            {standings.slice(0, 6).map(s => (
              <div key={s.rank} className={`standing-row ${s.you ? "you" : ""}`}>
                <span className="rank">#{s.rank}</span>
                <span className="team">{s.team}</span>
                <span className="num">{s.w}</span>
                <span className="num">{s.l}</span>
                <span className="num">{s.pf - s.pa > 0 ? "+" : ""}{s.pf - s.pa}</span>
                <span className="pts">{s.pts}</span>
              </div>
            ))}
          </div>

          <div className="section-h"><h2>Recent results</h2></div>
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

export function StandingsTable() {
  const S = useStandings();
  return (
    <div className="page-inner">
      <div className="dash-card">
        <div className="standing-row head" style={{ gridTemplateColumns: "40px 1fr 50px 50px 70px 70px 70px 60px" }}>
          <span></span><span>Team</span><span>W</span><span>L</span><span>PF</span><span>PA</span><span>±</span><span>PTS</span>
        </div>
        {S.map(s => (
          <div key={s.rank} className={`standing-row ${s.you ? "you" : ""}`} style={{ gridTemplateColumns: "40px 1fr 50px 50px 70px 70px 70px 60px" }}>
            <span className="rank">#{s.rank}</span>
            <span className="team">{s.team}</span>
            <span className="num">{s.w}</span>
            <span className="num">{s.l}</span>
            <span className="num">{s.pf}</span>
            <span className="num">{s.pa}</span>
            <span className="num" style={{ color: s.pf - s.pa > 0 ? "var(--good)" : "var(--ink-3)" }}>{s.pf - s.pa > 0 ? "+" : ""}{s.pf - s.pa}</span>
            <span className="pts">{s.pts}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface ScheduleGame {
  time: string;
  court: string;
  a: string;
  b: string;
  sa: number | null;
  sb: number | null;
  status: "F" | "LIVE" | "Up";
  live?: boolean;
}

function SchedulePlaceholder() {
  const games: ScheduleGame[] = [
    { time: "09:00", court: "A", a: "BKC", b: "SAR", sa: 78, sb: 42, status: "F" },
    { time: "09:00", court: "B", a: "MDS", b: "SJS", sa: 55, sb: 62, status: "F" },
    { time: "10:30", court: "A", a: "SGS", b: "SKL", sa: 71, sb: 54, status: "F" },
    { time: "10:30", court: "B", a: "ASC", b: "RIS", sa: 65, sb: 58, status: "F" },
    { time: "12:00", court: "A", a: "BKC", b: "SJS", sa: 68, sb: 51, status: "F" },
    { time: "12:00", court: "B", a: "SGS", b: "ASC", sa: 54, sb: 49, status: "LIVE", live: true },
    { time: "14:00", court: "A", a: "TUS", b: "BKP", sa: null, sb: null, status: "Up" },
    { time: "15:30", court: "A", a: "ISB", b: "WLS", sa: null, sb: null, status: "Up" },
  ];
  return (
    <div className="page-inner">
      <div className="dash-card">
        <div style={{ display: "grid", gridTemplateColumns: "80px 60px 1fr 80px 1fr 80px 60px", padding: "10px 18px", borderBottom: "1px solid var(--rule)", fontFamily: "IBM Plex Mono, monospace", fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
          <span>Time</span><span>Court</span><span>Home</span><span>Score</span><span>Away</span><span></span><span>Status</span>
        </div>
        {games.map((g, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "80px 60px 1fr 80px 1fr 80px 60px", padding: "14px 18px", borderBottom: "1px solid var(--rule)", alignItems: "center", background: g.live ? "var(--accent-soft)" : "transparent" }}>
            <span style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 500, fontSize: 16 }}>{g.time}</span>
            <span style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.06em" }}>CT {g.court}</span>
            <span style={{ fontWeight: g.sa != null && g.sb != null && g.sa > g.sb ? 600 : 400 }}>{g.a}</span>
            <span style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, color: g.sa != null && g.sb != null && g.sa > g.sb ? "var(--accent)" : "var(--ink)" }}>
              {g.sa !== null ? `${g.sa}–${g.sb}` : "—"}
            </span>
            <span style={{ fontWeight: g.sa != null && g.sb != null && g.sb > g.sa ? 600 : 400 }}>{g.b}</span>
            <span></span>
            <span style={{
              fontFamily: "IBM Plex Mono, monospace", fontSize: 11, letterSpacing: "0.1em",
              color: g.live ? "var(--live)" : (g.status === "F" ? "var(--ink-3)" : "var(--ink-2)"),
              fontWeight: g.live ? 500 : 400,
            }}>{g.status === "LIVE" ? "● LIVE" : (g.status === "F" ? "FINAL" : "UPCOMING")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
