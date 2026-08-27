import { useEvents, useFeed, useLiveGame } from "../lib/data";
import { useSession } from "../lib/session";
import { SampleData } from "../components/sample";
import type { Route } from "../lib/router";
import { m } from "../lib/i18n";

export function ProfilePage({ goto }: { goto: (r: Route) => void }) {
  const { user } = useSession();
  const { data: events = [], isPending: eventsLoading } = useEvents({ limit: 4 });
  const feed = useFeed();
  // The same fixture the live page renders, not a second hand-typed copy of it.
  // This block had "Saint Gabriel's", "54–49" and "SEED 4" written inline, so
  // the two screens could disagree about the same imaginary game — and the
  // scores had to be edited in two places to stay consistent.
  const G = useLiveGame();
  const [sa, sb] = [G.quarters.a, G.quarters.b].map((q) =>
    q.reduce<number>((acc, n) => acc + (n ?? 0), 0),
  ) as [number, number];
  const quickActions: [string, string, string][] = [
    ["+", "Create event", "Tournament, league, camp or showcase"],
    ["↗", "Add to roster", "12 players · 3 spots open"],
    ["⌘", "Ask AI assistant", "\"How are we doing this season?\""],
    ["↓", "Export season report", "PDF · spring 2026"],
  ];
  return (
    <>
      <div className="page-header">
        {/* The signed-in person, not a fixture. This greeted everybody as
            "Welcome back, Sukasem." — hardcoded fake identity on the page whose
            entire job is to show you yourself, with no SAMPLE DATA label
            because it did not look like sample data. The same bug the live
            page had. */}
        <div className="crumbs">{m.profile_crumb()}</div>
        <h1>{m.welcome_back({ name: user?.name || user?.email || "" })}</h1>
        <div className="sub">{user?.email ?? ""}</div>
      </div>

      <div className="page-inner">
        <div className="dash-grid">
          <div>
            <div className="section-h"><h2>{m.your_live_game()}</h2><a className="more" onClick={() => goto({ page: "live" })} style={{ cursor: "pointer" }}>{m.open_court_view()}</a></div>
            <div className="dash-card" style={{ borderColor: "var(--live)", borderWidth: 1.5 }}>
              <div className="head" style={{ color: "var(--live)" }}>
                <span><span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--live)", marginRight: 6, animation: "pulse 1.4s infinite" }}/>{m.live_now_at({ quarter: G.quarter, clock: G.clock, court: G.court, event: G.eventShort })}</span>
              </div>
              <div className="next-game">
                <div className="team">
                  <div className="name">{G.teamA.name}</div>
                  <div className="meta">{m.your_team()}</div>
                </div>
                <div className="when">
                  <div className="countdown" style={{ color: "var(--live)" }}>{sa}–{sb}</div>
                  <div className="label">{m.leading_by({ points: Math.abs(sa - sb) })}</div>
                </div>
                <div className="team r">
                  <div className="name">{G.teamB.name}</div>
                  <div className="meta">{m.seed_n({ n: G.teamB.seed })}</div>
                </div>
              </div>
            </div>

            <div className="section-h"><h2>{m.activity()}</h2><a className="more">{m.see_all()}</a></div>
            {/* Inline, not a page banner: the events above this ARE real, so the
                job here is to say which half is which. */}
            <SampleData inline />
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
            <div className="section-h"><h2>{m.your_events()}</h2><a className="more">{m.new_item()}</a></div>
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
              {eventsLoading && <div className="empty">{m.loading()}</div>}
              {!eventsLoading && events.length === 0 && <div className="empty">{m.no_events_yet()}</div>}
            </div>

            <div className="section-h"><h2>{m.quick_actions()}</h2></div>
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
