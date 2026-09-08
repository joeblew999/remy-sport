import { GameSummary } from "../components/game-summary";
import { useState } from "react";
import { Can } from "../components/can";
import { EditPlayer } from "../components/your-players";
import { FollowButton } from "../components/follow";
import { usePlayer, usePlayerStats, useTeamGames } from "../lib/data";
import { useSession } from "../lib/session";
import { m } from "../lib/i18n";
import { useLocale } from "../lib/locale";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "../components/button-link";
import { routeHref } from "../lib/router";
import { PageHeader, PageInner, SectionHeading } from "../components/page";
import { EmptyState, Loading } from "../components/states";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";

/**
 * @answers VIEW_PLAYER, VIEW_PLAYER_STATS, EDIT_PLAYER_PROFILE, FOLLOW_PLAYER, UNFOLLOW_PLAYER,
 * RECEIVE_PLAYER_NOTIFICATIONS
 *
 * A player, as anybody signed in can look at them.
 *
 * The model has five object types — EVENT, TEAM, PLAYER, ORG, GAME — and the app
 * had a page for four. A player was a row in somebody else's roster and nothing
 * more, which quietly made three other actions unreachable: `FollowButton`
 * accepts `PLAYER` and was rendered only for teams and events, so nobody could
 * follow one, and nobody could be notified about one either.
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
 * Statistics, since 2026-09-04: `playerGameStat` carries four columns a paper
 * scoresheet actually has, entered by whoever may `ENTER_SCORES`. The section
 * is absent, not empty, for a player with no lines — most have none, and a
 * blank stat block on every page is the same noise a "Previously: nothing"
 * card would be.
 *
 * The fixtures are their team's, and say so. A player has no games of their own
 * in this model — `game` joins two teams — so labelling their squad's fixtures
 * as theirs would be a claim the data does not make.
 */
export function PlayerPage({ id }: { id?: string }) {
  const { label, name } = useLocale();
  const { user, loading } = useSession();
  const player = usePlayer(id);
  const games = useTeamGames(player.data?.teamId ?? undefined);
  const stats = usePlayerStats(id);
  const [editing, setEditing] = useState(false);

  /**
   * Signed out is not "no such player".
   *
   * `players.get` is declared stricter than the model and refuses without a
   * session, so a visitor's query fails and `data` is undefined — which the
   * first version reported as "No such player." A page telling somebody a child
   * does not exist, when the truth is that they have not signed in, is a lie
   * the reader has no way to see through.
   */
  if (!user && !loading) return <PageInner><EmptyState data-testid="player-signin">{m.player_signin()}</EmptyState></PageInner>;
  if (player.isPending || loading) return <PageInner><Loading>{m.loading_player()}</Loading></PageInner>;
  if (!player.data) return <PageInner><EmptyState data-testid="player-not-found">{m.player_not_found()}</EmptyState></PageInner>;

  const p = player.data;
  const list = "gap-0 divide-y overflow-hidden rounded-xl border";
  const row = "rounded-none px-4 py-3";

  return (
    <div data-testid="player-page">
      <PageHeader
        crumbs={[{ label: m.nav_teams(), href: routeHref({ page: "teams" }) }]}
        title={<span data-testid="player-name">{name(p.names)}</span>}
        sub={<span data-testid="player-meta">{[`#${p.jerseyNumber}`, label("positions", p.positionCode)].join(" · ")}</span>}
      >
        {/* The control that existed and was never rendered anywhere. */}
        <div className="mt-4 flex flex-wrap gap-2">
          <FollowButton objectTypeCode="PLAYER" objectId={p.playerId} />
          <Can of={p} action="EDIT_PLAYER_PROFILE">
            {!editing && <Button variant="outline" data-testid={`edit-player-${p.playerId}`} onClick={() => setEditing(true)}>{m.player_edit()}</Button>}
          </Can>
        </div>
      </PageHeader>

      <PageInner className="flex flex-col gap-6">
        <Can of={p} action="EDIT_PLAYER_PROFILE">
          {editing && <EditPlayer key={p.playerId} player={p} onDone={() => setEditing(false)} />}
        </Can>

        <section>
          <SectionHeading title={m.player_team()} className="mt-0" />
          {p.teamId && p.teamNames ? (
            <ItemGroup className={list}>
              <Item className={row} data-testid={`player-team-${p.teamId}`}>
                <ItemContent><ItemTitle className="text-base">{name(p.teamNames)}</ItemTitle></ItemContent>
                <ItemActions>
                  <ButtonLink variant="outline" href={routeHref({ page: "team", id: p.teamId! })}>{m.team_open()}</ButtonLink>
                </ItemActions>
              </Item>
            </ItemGroup>
          ) : (
            // Between squads, and saying so is information. A player with no team is
            // a real state — signed up by a guardian and not yet placed.
            <EmptyState data-testid="player-no-team">{m.player_no_team()}</EmptyState>
          )}
        </section>

        {/* Where they have played before. `playerTeam` has carried `fromDate`
            and `toDate` since the fixtures were written and no screen had ever
            read the second. Absent rather than empty when there is none. */}
        {p.past.length > 0 && (
          <section>
            <SectionHeading title={m.player_past_teams()} className="mt-0" />
            <ItemGroup className={list} data-testid="player-past">
              {p.past.map((spell) => (
                <Item key={`${spell.teamId}-${spell.toDate}`} className={row} data-testid={`player-past-${spell.teamId}`}>
                  <ItemContent>
                    <ItemTitle className="text-base">{name(spell.teamNames)}</ItemTitle>
                    <ItemDescription>{m.player_spell_dates({ from: spell.fromDate, to: spell.toDate })}</ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <ButtonLink variant="outline" href={routeHref({ page: "team", id: spell.teamId })}>{m.team_open()}</ButtonLink>
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          </section>
        )}

        {/* Totals, then the games they came from. Per-game averages are shown
            beside each total rather than instead of it, divided by lines
            recorded, not games played. */}
        {stats.data && stats.data.recorded > 0 && (
          <section>
            <SectionHeading title={m.player_stats()} className="mt-0">
              <span className="text-sm text-muted-foreground" data-testid="player-stats-games">
                {m.player_stats_games({ n: stats.data.recorded })}
              </span>
            </SectionHeading>
            <ItemGroup className={list} data-testid="player-stats">
              {([
                ["points", m.stat_points()],
                ["rebounds", m.stat_rebounds()],
                ["assists", m.stat_assists()],
                ["fouls", m.stat_fouls()],
              ] as const).map(([key, heading]) => (
                <Item key={key} className={row} data-testid={`stat-${key}`}>
                  <ItemContent><ItemTitle className="text-base">{heading}</ItemTitle></ItemContent>
                  <ItemDescription className="tabular-nums">
                    {stats.data!.totals[key]}
                    {" · "}
                    {(stats.data!.totals[key] / stats.data!.recorded).toFixed(1)}{" "}
                    {m.player_stats_per_game()}
                  </ItemDescription>
                </Item>
              ))}
            </ItemGroup>
          </section>
        )}

        <section>
          <SectionHeading title={m.player_fixtures()} className="mt-0" />
          {games.data?.games.length ? (
            <ItemGroup className={list} data-testid="player-games">
              {games.data.games.slice(0, 10).map((g) => (
                <Item key={g.id} className={row} data-testid={`player-game-${g.id}`}>
                  <ItemContent><GameSummary game={g} showEvent/></ItemContent>
                </Item>
              ))}
            </ItemGroup>
          ) : (
            <EmptyState data-testid="player-no-games">{m.player_no_games()}</EmptyState>
          )}
        </section>
      </PageInner>
    </div>
  );
}
