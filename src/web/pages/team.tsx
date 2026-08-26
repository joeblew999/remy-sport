import { Icon } from "../components/icon";
import { useRoster, useTeam, useTeams } from "../lib/data";
import type { Route } from "../lib/router";
import { m } from "../lib/i18n";

interface ScheduleRow {
  date: string;
  vs: string;
  sa: number | string | null;
  sb: number | string | null;
  w?: boolean | null;
  live?: boolean;
  type: string;
}

export function TeamPage({ id, goto }: { id?: string; goto: (r: Route) => void }) {
  // The sidebar's "My team" links to #/team with no id. Until the SPA knows who
  // is signed in (ADR 008 step 4) there is no "my", so it falls back to the
  // first team — the same fallback #/event uses.
  const { data: team, loading: teamLoading } = useTeam(id);
  const { data: allTeams, loading: listLoading } = useTeams();
  const roster = useRoster();

  const t = id ? team : allTeams?.[0];

  if (id ? teamLoading : listLoading) {
    return <div className="empty">{m.loading_team()}</div>;
  }
  if (!t) {
    return (
      <div className="empty">
        <p>{m.not_found_team()}</p>
        <button onClick={() => goto({ page: "discover" })}>← Back to discover</button>
      </div>
    );
  }
  const schedule: ScheduleRow[] = [
    { date: "May 4", vs: "Triam Udom", sa: 71, sb: 64, w: true, type: "BSL" },
    { date: "May 7", vs: "Mater Dei", sa: 82, sb: 51, w: true, type: "BSL" },
    { date: "May 9", vs: "ISB", sa: 64, sb: 70, w: false, type: "BSL" },
    { date: "May 12", vs: "Suankularb", sa: 71, sb: 54, w: true, type: "CUP · R16" },
    { date: "May 13", vs: "Assumption", sa: "54", sb: "49", w: null, live: true, type: "CUP · QF" },
    { date: "May 14", vs: "TBA", sa: null, sb: null, type: "CUP · SF" },
    { date: "May 18", vs: "Bangkok Christian", sa: null, sb: null, type: "BSL" },
  ];
  return (
    <>
      <div className="team-hero">
        <div className={`crest ${t.crest}`}></div>
        <div>
          <h1 data-testid="team-name">{t.name}</h1>
          <div className="meta thai" style={{ fontFamily: "Noto Sans Thai, sans-serif", fontSize: 16, color: "var(--ink-2)", marginTop: 4 }}>
            {[t.orgName, t.city].filter(x => x && x !== "—").join(" · ")}
          </div>
          <div className="meta">{t.ageGroupCode} {t.genderLabel} · {t.short}</div>
          <div className="event-actions" style={{ marginTop: 16 }}>
            <button className="btn primary"><Icon name="follow"/>{m.follow()}</button>
            <button className="btn">{m.roster()}</button>
            <button className="btn">{m.stats()}</button>
            <button className="btn">{m.schedule()}</button>
          </div>
        </div>
        {/* RECORD and RANK need played games and a standings table. Both are
            roadmap Phase 3 (ADR 008) — showing "4–0 · #2" against a real team
            would read as fact rather than as the placeholder it is. */}
        <div style={{ display: "flex", gap: 32, alignItems: "baseline" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.14em", textTransform: "uppercase" }}>RECORD</div>
            <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 32, letterSpacing: "-0.02em", color: "var(--ink-3)" }}>{t.record ?? "—"}</div>
          </div>
        </div>
      </div>

      <div className="page-inner">
        {/* Roster and schedule are still fixtures — `players`/`player_teams`
            and a games table are ADR 008 Phase 2/3. Marked, because the team
            above them is now real and unlabelled sample data next to real data
            gets read as real. */}
        <div className="section-h"><h2>{m.roster()}</h2><a className="more">SAMPLE DATA</a></div>
        <div className="roster-grid">
          {roster.map(p => (
            <div key={p.num} className="player-card">
              <div className="ava">{p.name.split(" ").map(x => x[0]).join("")}</div>
              <div>
                <div className="name">{p.name}</div>
                <div className="pos">{p.pos} · {p.height}</div>
                <div className="stats">
                  <span><b>{p.pts}</b> PPG</span>
                  <span><b>{p.ast}</b> APG</span>
                  <span><b>{p.reb}</b> RPG</span>
                </div>
              </div>
              <div className="num">{p.num}</div>
            </div>
          ))}
        </div>

        <div className="section-h" style={{ marginTop: 48 }}><h2>Schedule · Spring 2026</h2><a className="more">SAMPLE DATA</a></div>
        <div className="dash-card">
          {schedule.map((g, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "90px 1fr 80px 100px 80px", padding: "14px 18px", borderBottom: "1px solid var(--rule)", alignItems: "center", background: g.live ? "var(--accent-soft)" : "transparent" }}>
              <span style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 500, fontSize: 14 }}>{g.date}</span>
              <span style={{ fontSize: 14 }}>vs <b>{g.vs}</b></span>
              <span style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.1em", textTransform: "uppercase" }}>{g.type}</span>
              <span style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 16, textAlign: "right" }}>
                {g.sa !== null ? `${g.sa}–${g.sb}` : <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>—</span>}
              </span>
              <span style={{
                fontFamily: "IBM Plex Mono, monospace", fontSize: 11, letterSpacing: "0.1em",
                textAlign: "right",
                color: g.live ? "var(--live)" : (g.w === true ? "var(--good)" : "var(--ink-3)"),
                fontWeight: g.live || g.w === true ? 500 : 400,
              }}>{g.live ? "● LIVE Q3" : (g.w === true ? "WIN" : (g.w === false ? "LOSS" : "UPCOMING"))}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
