import { FollowButton } from "../components/follow";
import { usePlayer, useTeamGames } from "../lib/data";
import { m } from "../lib/i18n";
import { useLocale } from "../lib/locale";
import type { Route } from "../lib/router";

/**
 * @answers VIEW_PLAYER, FOLLOW_PLAYER, UNFOLLOW_PLAYER, RECEIVE_PLAYER_NOTIFICATIONS
 *
 * A player, as anybody signed in can look at them.
 *
 * The model has five object types — EVENT, TEAM, PLAYER, ORG, GAME — and the app
 * had a page for four. A player was a row in somebody else's roster and nothing
 * more, which quietly made three other actions unreachable: `FollowButton`
 * accepts `PLAYER` and was rendered only for teams and events, so nobody could
 * follow one, and nobody could be notified about one either.
 *
 * `VIEW_PLAYER` was being answered by `your-players.tsx` — a guardian looking at
 * their own children. That is one reader out of everyone the model grants it to.
 *
 * ## Behind a session
 *
 * `players.get` is declared `stricter` than the model: PUBLIC in the matrix,
 * a session here, because this page names a minor, their school and their
 * fixtures. The same line `domain.ts` already drew for every player list, in its
 * own words — "these rows name minors, so a session is required".
 *
 * ## What it does not show
 *
 * No guardians. `domain.ts` does not expose that table at all, and a page is
 * exactly where it would leak.
 *
 * No statistics. `VIEW_PLAYER_STATS` is at the model boundary: scores are per
 * team, and nothing records what a player did. A "Points" heading over a blank
 * column would be a promise the schema cannot keep.
 *
 * The fixtures are their team's, and say so. A player has no games of their own
 * in this model — `game` joins two teams — so labelling their squad's fixtures
 * as theirs would be a claim the data does not make.
 */
export function PlayerPage({ id, goto }: { id?: string; goto: (r: Route) => void }) {
  const { label, name } = useLocale();
  const player = usePlayer(id);
  const games = useTeamGames(player.data?.teamId ?? undefined);

  if (player.isPending) return <div className="empty">{m.loading_player()}</div>;
  if (!player.data) {
    return (
      <div className="empty" data-testid="player-not-found">
        {m.player_not_found()}
      </div>
    );
  }

  const p = player.data;

  return (
    <div className="page-inner" data-testid="player-page">
      <div className="page-header">
        <div className="crumbs">{m.nav_teams()}</div>
        <h1 data-testid="player-name">{name(p.names)}</h1>
        <div className="sub" data-testid="player-meta">
          {[`#${p.jerseyNumber}`, label("positions", p.positionCode)].join(" · ")}
        </div>
        {/* The control that existed and was never rendered anywhere. */}
        <FollowButton objectTypeCode="PLAYER" objectId={p.playerId} />
      </div>

      <div className="section-h">
        <h2>{m.player_team()}</h2>
      </div>
      {p.teamId && p.teamNames ? (
        <div className="dash-card">
          <div className="device-row" data-testid={`player-team-${p.teamId}`}>
            <div className="device-label">{name(p.teamNames)}</div>
            <button className="btn" onClick={() => goto({ page: "team", id: p.teamId! })}>
              {m.team_open()}
            </button>
          </div>
        </div>
      ) : (
        // Between squads, and saying so is information. A player with no team is
        // a real state — signed up by a guardian and not yet placed.
        <div className="empty" data-testid="player-no-team">
          {m.player_no_team()}
        </div>
      )}

      <div className="section-h">
        <h2>{m.player_fixtures()}</h2>
      </div>
      {games.data?.games.length ? (
        <div className="dash-card" data-testid="player-games">
          {games.data.games.slice(0, 10).map((g) => (
            <div key={g.id} className="device-row" data-testid={`player-game-${g.id}`}>
              <div>
                {/* Their squad's point of view, which `useTeamGames` already
                    resolves — "vs Montfort", not a pair of team ids the reader
                    has to work out which side of. */}
                <div className="device-label">
                  {[m.versus(), g.opponent].join(" ")}
                </div>
                <div className="device-meta">
                  {[g.venue, g.statusLabel].filter(Boolean).join(" · ")}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty" data-testid="player-no-games">
          {m.player_no_games()}
        </div>
      )}
    </div>
  );
}
