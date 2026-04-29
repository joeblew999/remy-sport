import { Icon } from "../components/icon";
import { useRoster } from "../lib/data";
import type { Route } from "../lib/router";
import type { Lang } from "../lib/i18n";

interface ScheduleRow {
  date: string;
  vs: string;
  sa: number | string | null;
  sb: number | string | null;
  w?: boolean | null;
  live?: boolean;
  type: string;
}

export function TeamPage({ goto: _goto, lang: _lang }: { goto: (r: Route) => void; lang?: Lang }) {
  const roster = useRoster();
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
        <div className="crest"></div>
        <div>
          <h1>Saint Gabriel's College</h1>
          <div className="meta thai" style={{ fontFamily: "Noto Sans Thai, sans-serif", fontSize: 16, color: "var(--ink-2)", marginTop: 4 }}>เซนต์คาเบรียล · บางกอก</div>
          <div className="meta">U16 Boys · Roster of 12 · Coach Sukasem · Founded 1920</div>
          <div className="event-actions" style={{ marginTop: 16 }}>
            <button className="btn primary"><Icon name="follow"/>Following</button>
            <button className="btn">Roster</button>
            <button className="btn">Stats</button>
            <button className="btn">Schedule</button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 32, alignItems: "baseline" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.14em", textTransform: "uppercase" }}>RECORD</div>
            <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 32, letterSpacing: "-0.02em" }}>4–0</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.14em", textTransform: "uppercase" }}>RANK</div>
            <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 32, letterSpacing: "-0.02em", color: "var(--accent)" }}>#2</div>
          </div>
        </div>
      </div>

      <div className="page-inner">
        <div className="section-h"><h2>Roster</h2><a className="more">EXPORT CSV →</a></div>
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

        <div className="section-h" style={{ marginTop: 48 }}><h2>Schedule · Spring 2026</h2><a className="more">FULL SEASON →</a></div>
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
