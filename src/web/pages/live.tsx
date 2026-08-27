import { Icon } from "../components/icon";
import { useLiveGame } from "../lib/data";
import type { Route } from "../lib/router";
import { m } from "../lib/i18n";
import { SampleData } from "../components/sample";

interface LiveProps {
  goto: (r: Route) => void;
  spoiler: boolean;
  setSpoiler: (fn: boolean | ((prev: boolean) => boolean)) => void;
}

export function LivePage({ goto, spoiler, setSpoiler }: LiveProps) {
  const G = useLiveGame();
  const sa = G.quarters.a.reduce<number>((acc, b) => acc + (b ?? 0), 0);
  const sb = G.quarters.b.reduce<number>((acc, b) => acc + (b ?? 0), 0);
  const aLeading = sa > sb;

  return (
    <div className="live-page">
      <SampleData />
      <div className="crumbs" style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "IBM Plex Mono, monospace", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12, color: "oklch(0.6 0.01 270)" }}>
        <button onClick={() => goto({ page: "discover" })} style={{ background: "transparent", border: "none", padding: 0, color: "inherit", cursor: "pointer", fontFamily: "inherit", fontSize: "inherit", letterSpacing: "inherit" }}>{m.nav_discover()}</button>
        <span style={{ opacity: 0.5 }}>/</span>
        <button onClick={() => goto({ page: "event", id: "e1" })} style={{ background: "transparent", border: "none", padding: 0, color: "inherit", cursor: "pointer", fontFamily: "inherit", fontSize: "inherit", letterSpacing: "inherit" }}>{G.eventShort}</button>
        <span style={{ opacity: 0.5 }}>/</span>
        <span>{G.round}</span>
      </div>

      <div className="spoiler-bar">
        <span><Icon name={spoiler ? "eyeoff" : "eye"}/> &nbsp; {spoiler ? m.spoiler_on() : m.spoiler_off()}</span>
        <button className="toggle" onClick={() => setSpoiler(s => !s)} style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, color: "oklch(0.7 0.01 270)" }}>
          {m.hide_scores()}
          <span className={`toggle-track ${spoiler ? "on" : ""}`}/>
        </button>
      </div>

      <div className="live-header">
        <div>
          <div className="court">{G.event}</div>
          <div className="court" style={{ color: "oklch(0.85 0.01 270)", marginTop: 4 }}>{G.court} · {G.venue}</div>
        </div>
        <div className="row-flex" style={{ gap: 12 }}>
          <span style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: "oklch(0.7 0.01 270)", letterSpacing: "0.06em" }}>
            <Icon name="eye"/> &nbsp; {m.watching_count({ count: G.watching })}
          </span>
          <div className="pill"><span className="dot"/>{m.status_live()}</div>
        </div>
      </div>

      <div className="live-scoreboard">
        <div className="score-team">
          <div className="crest a"></div>
          <div className="name">{G.teamA.name}</div>
          <div className="meta">{m.seed_n({ n: G.teamA.seed })} · {G.teamA.record}</div>
        </div>
        {!spoiler ? (
          <div className="score-numbers">
            <span className={aLeading ? "leading" : ""}>{sa}</span>
            <span className="sep">·</span>
            <span className={!aLeading ? "leading" : ""}>{sb}</span>
          </div>
        ) : (
          <div className="score-numbers" style={{ color: "oklch(0.4 0.01 270)" }}>
            <span>--</span>
            <span className="sep">·</span>
            <span>--</span>
          </div>
        )}
        <div className="score-team r">
          <div className="crest b"></div>
          <div className="name">{G.teamB.name}</div>
          <div className="meta">{m.seed_n({ n: G.teamB.seed })} · {G.teamB.record}</div>
        </div>
      </div>

      <div className="live-clock">
        <div className="quarter">{m.quarter_remaining({ n: G.quarter.replace("Q", ""), clock: G.clock })}</div>
        <div className="time" style={{ color: "var(--accent)" }}>{G.clock}</div>
      </div>

      <div className="quarters-table">
        <div className="row" style={{ display: "contents" }}>
          <div className="cell head label">{m.team()}</div>
          <div className="cell head">{m.quarter_short({ n: 1 })}</div>
          <div className="cell head">{m.quarter_short({ n: 2 })}</div>
          <div className="cell head">{m.quarter_short({ n: 3 })}</div>
          <div className="cell head">{m.quarter_short({ n: 4 })}</div>
          <div className="cell head"></div>
          <div className="cell head">{m.total()}</div>
        </div>
        <div className="row" style={{ display: "contents" }}>
          <div className="cell team-name">{G.teamA.short} · {G.teamA.name}</div>
          {G.quarters.a.map((q, i) => (
            <div key={i} className="cell">{q !== null ? q : "—"}</div>
          ))}
          <div className="cell"></div>
          <div className="cell total">{spoiler ? "--" : sa}</div>
        </div>
        <div className="row" style={{ display: "contents" }}>
          <div className="cell team-name">{G.teamB.short} · {G.teamB.name}</div>
          {G.quarters.b.map((q, i) => (
            <div key={i} className="cell">{q !== null ? q : "—"}</div>
          ))}
          <div className="cell"></div>
          <div className="cell total" style={{ color: !aLeading ? "var(--accent)" : "oklch(0.7 0.01 270)" }}>{spoiler ? "--" : sb}</div>
        </div>
      </div>

      <div className="live-side-grid">
        <div className="panel">
          <div className="panel-head"><span>{m.play_by_play()}</span><span>{m.auto_scroll()}</span></div>
          <div className="play-by-play">
            {G.pbp.map((p, i) => (
              <div key={i} className={`play ${p.score ? "score-event" : ""}`}>
                <span className="ts">{p.ts}</span>
                <span className="desc" dangerouslySetInnerHTML={{ __html: p.desc }}/>
              </div>
            ))}
          </div>
        </div>

        <div className="live-actions">
          <button className="live-action-btn primary">
            <div>
              <div className="label">{m.quick_action()}</div>
              <div className="val">{m.ask_ai()}</div>
            </div>
            <span className="icon">⌘K</span>
          </button>
          <button className="live-action-btn">
            <div>
              <div className="label">{m.box_score()}</div>
              <div className="val">{m.player_stats()}</div>
            </div>
          </button>
          <button className="live-action-btn">
            <div>
              <div className="label">{m.parents_family()}</div>
              <div className="val">{m.watching_count({ count: G.watching })}</div>
            </div>
            <span style={{ color: "var(--accent)" }}>+</span>
          </button>
          <button className="live-action-btn">
            <div>
              <div className="label">{m.scorer()}</div>
              <div className="val">{G.scorer}</div>
            </div>
          </button>
          <button className="live-action-btn" onClick={() => goto({ page: "event", id: "e1" })}>
            <div>
              <div className="label">{m.event()}</div>
              <div className="val">{G.eventShort} →</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
