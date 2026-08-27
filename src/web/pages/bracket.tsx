import { m } from "../lib/i18n";
import { useBracket } from "../lib/data";
import { SampleData } from "../components/sample";
import type { Route } from "../lib/router";

export function BracketView({ goto }: { goto: (r: Route) => void }) {
  const B = useBracket();
  return (
    <div className="bracket-page">
      <SampleData />
      <div className="legend">
        <span style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ink-3)" }}>{m.bracket_format({ teams: 16 })}</span>
        <span style={{ marginLeft: "auto" }}/>
        <span className="swatch live"><span className="dot"/>{m.status_live()}</span>
        <span className="swatch done"><span className="dot"/>{m.status_final()}</span>
        <span className="swatch upcoming"><span className="dot"/>{m.status_upcoming()}</span>
      </div>
      <div className="bracket">
        {B.rounds.map((r, ri) => (
          <div key={ri} className="bracket-round">
            <div className="round-label">{r.label}</div>
            <div className="matches">
              {r.matches.map(m => (
                <button key={m.id} className={`match ${m.status === "live" ? "live" : ""}`} onClick={() => m.status === "live" && goto({ page: "live" })}>
                  <div className="match-head">
                    <span>{m.label ?? (m.status === "done" ? "FINAL" : "UPCOMING")}</span>
                    <span style={{ fontFamily: "IBM Plex Mono, monospace" }}>{m.id.toUpperCase()}</span>
                  </div>
                  {[m.a, m.b].map((t, ti) => (
                    <div key={ti} className={`match-team ${t.win ? "win" : ""} ${t.tba ? "tba" : ""} ${m.status === "live" && t.win ? "live" : ""}`}>
                      <span className="seed">{t.seed ? `#${t.seed}` : ""}</span>
                      <span className="name">{t.name}</span>
                      {t.score !== undefined && <span className="score">{t.score}</span>}
                    </div>
                  ))}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
