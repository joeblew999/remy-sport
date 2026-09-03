import { useMine, useLiveGames } from "../lib/data";
import type { Route } from "../lib/router";
import { m } from "../lib/i18n";

/**
 * The games you are refereeing.
 *
 * Adisorn had no screen for this. Not broken — never built, and it could not be:
 * the server could answer "all games" and "this game", never "mine", so the only
 * way to show a referee their assignments was to fetch every game and filter in
 * the browser, which is the bug this whole change removes. `me.mine` answers it
 * now, and this is the first thing to read the GAME holdings.
 *
 * On the profile rather than its own page, beside the other things that are
 * yours — your events, your players, what you follow. A referee opening the app
 * has one question, and it is this one.
 *
 * Renders nothing for everybody else. Most readers are not referees, and an
 * empty card explaining that you have no assignments to a parent is noise.
 */
export function YourGames({ goto }: { goto: (r: Route) => void }) {
  const { data: mine } = useMine("GAME");
  /**
   * The whole list, joined locally — and this is the one place that is a
   * judgement rather than an obvious win.
   *
   * Games are the growing kind: 29 today, thousands across seasons. A referee's
   * own assignments stay small, so holdings is the right shape for *them*; it is
   * an organiser, who holds every game in every event they run, that outgrows
   * it. Those two relations are deliberately excluded from `me.mine` — see
   * src/api/me.ts — so nothing here can be handed a thousand ids.
   *
   * What can still grow is this join: `games.list` is every game on the
   * platform. When that hurts, the answer is a narrowed request for games, and
   * docs/plan-ownership.md says so rather than leaving it to be rediscovered.
   */
  const { data: live } = useLiveGames();
  const ids = new Set(mine.map((h) => h.id));
  const games = (live?.games ?? []).filter((g) => ids.has(g.id));

  if (mine.length === 0) return null;

  return (
    <>
      <div className="section-h">
        <h2>{m.your_games()}</h2>
      </div>
      <div className="dash-card" data-testid="your-games">
        {games.length === 0 ? (
          <div className="empty" data-testid="your-games-none">
            {m.no_games_assigned()}
          </div>
        ) : (
          games.map((g) => (
            <button
              key={g.id}
              className="row-button"
              data-testid={`your-game-${g.id}`}
              onClick={() => goto({ page: "watch", id: g.id })}
            >
              <div className="row-title">
                {g.homeTeam} {m.versus()} {g.awayTeam}
              </div>
              <div className="row-meta">
                {g.statusLabel}
                {g.venue ? ` · ${g.venue}` : ""}
              </div>
            </button>
          ))
        )}
      </div>
    </>
  );
}
