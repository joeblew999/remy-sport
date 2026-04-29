import { useEvents, useFeed } from "../lib/data";
import type { Route } from "../lib/router";

export function ProfilePage({ goto }: { goto: (r: Route) => void }) {
  const events = useEvents({ limit: 4 });
  const feed = useFeed();
  const quickActions: [string, string, string][] = [
    ["+", "Create event", "Tournament, league, camp or showcase"],
    ["↗", "Add to roster", "12 players · 3 spots open"],
    ["⌘", "Ask AI assistant", "\"How are we doing this season?\""],
    ["↓", "Export season report", "PDF · spring 2026"],
  ];
  return (
    <>
      <div className="page-header">
        <div className="crumbs">PROFILE / COACH</div>
        <h1>Welcome back, Sukasem.</h1>
        <div className="sub">Saint Gabriel's College · U16 Boys · Head Coach since 2019</div>
      </div>

      <div className="page-inner">
        <div className="dash-grid">
          <div>
            <div className="section-h"><h2>Your live game</h2><a className="more" onClick={() => goto({ page: "live" })} style={{ cursor: "pointer" }}>OPEN COURT VIEW →</a></div>
            <div className="dash-card" style={{ borderColor: "var(--live)", borderWidth: 1.5 }}>
              <div className="head" style={{ color: "var(--live)" }}>
                <span><span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--live)", marginRight: 6, animation: "pulse 1.4s infinite" }}/>LIVE · Q3 06:42 · COURT B · BANGKOK CUP QF</span>
              </div>
              <div className="next-game">
                <div className="team">
                  <div className="name">Saint Gabriel's</div>
                  <div className="meta">YOUR TEAM</div>
                </div>
                <div className="when">
                  <div className="countdown" style={{ color: "var(--live)" }}>54–49</div>
                  <div className="label">LEADING +5</div>
                </div>
                <div className="team r">
                  <div className="name">Assumption</div>
                  <div className="meta">SEED 4</div>
                </div>
              </div>
            </div>

            <div className="section-h"><h2>Activity</h2><a className="more">ALL →</a></div>
            <div className="dash-card feed-list">
              {feed.map((f, i) => (
                <div key={i} className="feed-item">
                  <div className={`dot ${f.dot === "live" ? "" : (f.dot === "on" ? "" : "muted")}`} style={f.dot === "live" ? { background: "var(--live)", animation: "pulse 1.4s infinite" } : {}}></div>
                  <div>
                    <div className="desc" dangerouslySetInnerHTML={{ __html: f.desc }}></div>
                    <span className="ts">{f.ts}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="section-h"><h2>Your events</h2><a className="more">+ NEW</a></div>
            <div className="dash-card">
              {events.map(e => (
                <button key={e.id} onClick={() => goto({ page: "event", id: e.id })} style={{
                  display: "block", width: "100%", textAlign: "left",
                  padding: "14px 18px", borderBottom: "1px solid var(--rule)",
                  background: "transparent", border: "none", cursor: "pointer",
                  borderLeft: "none", borderRight: "none", borderTop: "none",
                }}>
                  <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 14, letterSpacing: "-0.01em" }}>{e.title}</div>
                  <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.06em", marginTop: 4, textTransform: "uppercase" }}>
                    {e.statusLabel} · {e.div}
                  </div>
                </button>
              ))}
            </div>

            <div className="section-h"><h2>Quick actions</h2></div>
            <div className="dash-card">
              {quickActions.map((a, i) => (
                <button key={i} style={{
                  display: "grid", gridTemplateColumns: "32px 1fr", gap: 12,
                  width: "100%", textAlign: "left",
                  padding: "14px 18px", borderBottom: i < 3 ? "1px solid var(--rule)" : "none",
                  background: "transparent", border: "none", cursor: "pointer",
                  alignItems: "center",
                }}>
                  <span style={{
                    width: 32, height: 32, borderRadius: "50%",
                    background: "var(--paper-2)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: "Space Grotesk, sans-serif", fontWeight: 500,
                  }}>{a[0]}</span>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>{a[1]}</div>
                    <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>{a[2]}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
