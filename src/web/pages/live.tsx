import { Icon } from "../components/icon";
import { useLiveGames } from "../lib/data";
import type { Route } from "../lib/router";
import { m } from "../lib/i18n";

/**
 * What is being played right now, and what can be watched.
 *
 * This page used to render one hardcoded game from the sample data — a fixed
 * score, a fixed clock, a fixed pair of teams — behind a SAMPLE DATA banner. It
 * was the one place a person would go to find a live game, and it could not
 * answer that question about the actual database.
 *
 * It is also where live video becomes findable. Cloudflare's relay does not
 * support broadcast discovery, so nothing can ask it what is being published;
 * `isBroadcasting` comes from our own table, kept fresh by the publisher's
 * heartbeat. Without a list like this, the only way to discover a broadcast is
 * to be told its URL.
 */

interface LiveProps {
  goto: (r: Route) => void;
  spoiler: boolean;
  setSpoiler: (fn: boolean | ((prev: boolean) => boolean)) => void;
}

export function LivePage({ goto, spoiler, setSpoiler }: LiveProps) {
  const { data, isPending } = useLiveGames();
  const games = data?.games ?? [];

  return (
    <>
      <div className="page-header">
        <div className="crumbs">{m.nav_live()}</div>
        <h1>{m.live_and_next()}</h1>
      </div>

      <div className="page-inner">
        <div className="spoiler-bar">
          <span>
            <Icon name={spoiler ? "eyeoff" : "eye"} /> &nbsp;
            {spoiler ? m.spoiler_on() : m.spoiler_off()}
          </span>
          <button
            className="toggle"
            onClick={() => setSpoiler((s) => !s)}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: "var(--ink-3)",
            }}
          >
            {m.hide_scores()}
            <span className={`toggle-track ${spoiler ? "on" : ""}`} />
          </button>
        </div>

        {isPending && <div className="empty">{m.loading()}</div>}
        {!isPending && games.length === 0 && (
          <div className="empty" data-testid="no-live-games">
            {m.no_live_games()}
          </div>
        )}

        <div className="dash-card" data-testid="live-list">
          {games.map((g) => (
            <div key={g.id} className="fixture-row live" data-testid={`live-${g.id}`}>
              <span className="opponent">
                <b>{g.homeTeam}</b> {m.versus()} <b>{g.awayTeam}</b>
              </span>
              <span className="kind">{g.venue ?? ""}</span>
              <span className="result">
                {/* Spoiler mode hides the score and nothing else: a viewer who
                    wants to watch without knowing the result still needs to
                    find the game. */}
                {spoiler ? (
                  <span className="muted">—</span>
                ) : g.homeScore !== null && g.awayScore !== null ? (
                  `${g.homeScore}–${g.awayScore}`
                ) : (
                  <span className="muted">—</span>
                )}
              </span>
              <span className="outcome" style={{ color: "var(--live)", fontWeight: 500 }}>
                {g.statusLabel}
              </span>
              <span className="live-actions">
                {/* Only where a camera is actually pointed at it. A Watch link
                    on a game nobody is broadcasting is a link to a black
                    rectangle, which is how this feature earns a reputation. */}
                {g.isBroadcasting && (
                  <button
                    className="btn primary"
                    onClick={() => goto({ page: "watch", id: g.id })}
                    data-testid={`watch-${g.id}`}
                  >
                    {m.video_watch()}
                  </button>
                )}
                {g.canBroadcast && !g.isBroadcasting && (
                  <button
                    className="btn"
                    onClick={() => goto({ page: "broadcast", id: g.id })}
                    data-testid={`broadcast-${g.id}`}
                  >
                    {m.video_broadcast()}
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
