import { EyeIcon, EyeOffIcon } from "lucide-react";
import { QueryError } from "../components/query-error";
import { GameSummary } from "../components/game-summary";
import { Can } from "../components/can";
import { PageHeader, PageInner, Row, RowGroup } from "../components/page";
import { EmptyState, Loading } from "../components/states";
import { StatusBadge } from "../components/status-badge";
import { useLiveGames } from "../lib/data";
import { routeHref } from "../lib/router";
import { m } from "../lib/i18n";
import { ButtonLink } from "../components/button-link";
import { Item, ItemActions, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

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
  spoiler: boolean;
  setSpoiler: (fn: boolean | ((prev: boolean) => boolean)) => void;
}

/**
 * @answers VIEW_LIVE_SCORES, SPOILER_MODE
 *
 * Scores as they happen, and the choice not to see them yet. The spoiler bar
 * hides the score and nothing else — a reader who came for the fixture still
 * gets it.
 */
export function LivePage({ spoiler, setSpoiler }: LiveProps) {
  const liveQuery = useLiveGames();
  const { data, isPending } = liveQuery;
  const games = data?.games ?? [];

  return (
    <>
      <PageHeader crumbs={[{ label: m.nav_live() }]} title={m.live_and_next()} />

      <PageInner className="flex flex-col gap-4">
        <QueryError error={liveQuery.error} retry={liveQuery.refetch} pending={liveQuery.isFetching} />

        {/* The in-context spoiler control. The setting itself lives in the
            sidebar's Settings group; this is the same switch where the scores
            are. */}
        <Item variant="muted" data-testid="spoiler-bar">
          <ItemMedia variant="icon">{spoiler ? <EyeOffIcon /> : <EyeIcon />}</ItemMedia>
          <ItemContent>
            <ItemTitle>{spoiler ? m.spoiler_on() : m.spoiler_off()}</ItemTitle>
          </ItemContent>
          <ItemActions>
            <Label htmlFor="live-spoiler">{m.hide_scores()}</Label>
            <Switch
              id="live-spoiler"
              checked={spoiler}
              data-testid="live-spoiler"
              onCheckedChange={(checked) => setSpoiler(checked === true)}
            />
          </ItemActions>
        </Item>

        {isPending && <Loading />}
        {!isPending && !liveQuery.error && games.length === 0 && (
          <EmptyState data-testid="no-live-games">{m.no_live_games()}</EmptyState>
        )}

        {games.length > 0 && (
          <RowGroup data-testid="live-list">
            {games.map((g) => (
              <Row className="flex-wrap" key={g.id} data-testid={`live-${g.id}`}>
                <ItemContent className="basis-full sm:basis-auto" data-testid="live-game">
                  <GameSummary game={g} showEvent/>
                </ItemContent>
                <ItemContent className="ml-auto flex-none items-end text-right">
                  {/* Spoiler mode hides the score and nothing else: a viewer who
                      wants to watch without knowing the result still needs to
                      find the game. */}
                  <span className="text-base font-semibold tabular-nums" data-testid="live-score">
                    {spoiler || g.homeScore === null || g.awayScore === null
                      ? <span className="text-muted-foreground">—</span>
                      : `${g.homeScore}–${g.awayScore}`}
                  </span>
                  <StatusBadge status={g.statusCode} data-testid="live-status">{g.statusLabel}</StatusBadge>
                </ItemContent>
                {/* Only where a camera is actually pointed at it. A Watch link
                    on a game nobody is broadcasting is a link to a black
                    rectangle, which is how this feature earns a reputation. */}
                {/* `empty:hidden`: the gate decides whether anything renders
                    here, and an empty action row must not keep its gap. */}
                <ItemActions className="basis-full empty:hidden">
                  {g.isBroadcasting ? (
                    <ButtonLink href={routeHref({ page: "watch", id: g.id })} data-testid={`watch-${g.id}`}>
                      {m.video_watch()}
                    </ButtonLink>
                  ) : (
                    <Can of={g} action="BROADCAST_GAME">
                      <ButtonLink variant="outline" href={routeHref({ page: "broadcast", id: g.id })} data-testid={`broadcast-${g.id}`}>
                        {m.video_broadcast()}
                      </ButtonLink>
                    </Can>
                  )}
                </ItemActions>
              </Row>
            ))}
          </RowGroup>
        )}
      </PageInner>
    </>
  );
}
