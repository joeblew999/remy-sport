import { Icon } from "../components/icon";
import { useLiveGame } from "../lib/data";
import type { Route } from "../lib/router";
import type { Lang } from "../lib/i18n";

interface LiveProps {
  goto: (r: Route) => void;
  lang?: Lang;
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
      <div className="crumbs" style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "IBM Plex Mono, monospace", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12, color: "oklch(0.6 0.01 270)" }}>
        <button onClick={() => goto({ page: "discover" })} style={{ background: "transparent", border: "none", padding: 0, color: "inherit", cursor: "pointer", fontFamily: "inherit", fontSize: "inherit", letterSpacing: "inherit" }}>DISCOVER</button>
        <span style={{ opacity: 0.5 }}>/</span>
        <button onClick={() => goto({ page: "event", id: "e1" })} style={{ background: "transparent", border: "none", padding: 0, color: "inherit", cursor: "pointer", fontFamily: "inherit", fontSize: "inherit", letterSpacing: "inherit" }}>BANGKOK CUP</button>
        <span style={{ opacity: 0.5 }}>/</span>
        <span>QUARTERFINAL 2</span>
      </div>

      <div className="spoiler-bar">
        <span><Icon name={spoiler ? "eyeoff" : "eye"}/> &nbsp; {spoiler ? "SPOILER MODE ON · scores hidden" : "SHOWING LIVE SCORES"}</span>
        <button className="toggle" onClick={() => setSpoiler(s => !s)} style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, color: "oklch(0.7 0.01 270)" }}>
          HIDE SCORES
          <span className={`toggle-track ${spoiler ? "on" : ""}`}/>
        </button>
      </div>

      <div className="live-header">
        <div>
          <div className="court">{G.event}</div>
          <div className="court" style={{ color: "oklch(0.85 0.01 270)", marginTop: 4 }}>{G.court} · HUA MARK INDOOR · BANGKOK</div>
        </div>
        <div className="row-flex" style={{ gap: 12 }}>
          <span style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: "oklch(0.7 0.01 270)", letterSpacing: "0.06em" }}>
            <Icon name="eye"/> &nbsp; {G.watching} watching
          </span>
          <div className="pill"><span className="dot"/>LIVE</div>
        </div>
      </div>

      <div className="live-scoreboard">
        <div className="score-team">
          <div className="crest a"></div>
          <div className="name">{G.teamA.name}</div>
          <div className="name-th">{G.teamA.nameTh}</div>
          <div className="meta">SEED {G.teamA.seed} · {G.teamA.record}</div>
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
          <div className="name-th">{G.teamB.nameTh}</div>
          <div className="meta">SEED {G.teamB.seed} · {G.teamB.record}</div>
        </div>
      </div>

      <div className="live-clock">
        <div className="quarter">QUARTER {G.quarter.replace("Q", "")} · {parseInt(G.clock.split(":")[0], 10)}:{G.clock.split(":")[1]} REMAINING</div>
        <div className="time" style={{ color: "var(--accent)" }}>{G.clock}</div>
      </div>

      <div className="quarters-table">
        <div className="row" style={{ display: "contents" }}>
          <div className="cell head label">Team</div>
          <div className="cell head">Q1</div>
          <div className="cell head">Q2</div>
          <div className="cell head">Q3</div>
          <div className="cell head">Q4</div>
          <div className="cell head"></div>
          <div className="cell head">Total</div>
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
          <div className="panel-head"><span>PLAY-BY-PLAY</span><span>AUTO-SCROLL ↻</span></div>
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
              <div className="label">QUICK ACTION</div>
              <div className="val">Ask AI assistant</div>
            </div>
            <span className="icon">⌘K</span>
          </button>
          <button className="live-action-btn">
            <div>
              <div className="label">BOX SCORE</div>
              <div className="val">Player stats →</div>
            </div>
          </button>
          <button className="live-action-btn">
            <div>
              <div className="label">PARENTS &amp; FAMILY</div>
              <div className="val">412 watching</div>
            </div>
            <span style={{ color: "var(--accent)" }}>+</span>
          </button>
          <button className="live-action-btn">
            <div>
              <div className="label">SCORER</div>
              <div className="val">Coach Sukasem</div>
            </div>
          </button>
          <button className="live-action-btn" onClick={() => goto({ page: "event", id: "e1" })}>
            <div>
              <div className="label">EVENT</div>
              <div className="val">Bangkok Cup '26 →</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
