import { routeHref } from "../lib/router";
/**
 * The two live-video surfaces: point a camera at a game, or watch one.
 *
 * A test harness that happens to look like a feature. What it is for is finding
 * out how live video behaves from a school gym in Bangkok — a phone uplink, a
 * browser without WebTransport, a coach who pockets the handset at half time —
 * and the analytics half is the answer, not the picture. Every session is
 * reported, working or not, because a fallback count with no denominator cannot
 * be acted on.
 *
 * Broadcast access is answered per game by the server and checked again on
 * every broadcast mutation. Unknown answers must not offer camera capture.
 */

import { GameBroadcast, GameVideo } from "../components/moq-video"
import { PageHeader, PageInner } from "../components/page"
import { EmptyState, Loading } from "../components/states"
import { StatusBadge } from "../components/status-badge"
import { Badge } from "@/components/ui/badge"
import { ButtonLink } from "../components/button-link"
import { Item, ItemContent, ItemTitle, ItemDescription } from "@/components/ui/item"
import { useDefaultGame, useGame } from "../lib/data"
import { m } from "../lib/i18n"

/**
 * The game itself, above the video.
 *
 * Watching a game is not a different activity from following it: the score, who
 * is playing and where matter whether or not a picture has arrived, and they are
 * what the page is worth reading before the first frame and after the last. A
 * bare player is also a dead end — somebody who lands on it from a shared link
 * has nowhere to go and nothing to see if the broadcast has ended.
 *
 * Polled, because the score changes while somebody is watching.
 */
function GameHeading({ gameId }: { gameId: string }) {
  const { data: game } = useGame(gameId, { refetchInterval: 10_000 })
  if (!game) return null
  const played = game.homeScore !== null && game.awayScore !== null
  return (
    <>
      <Item variant="outline">
        <ItemContent>
          <ItemTitle data-testid="video-game">{game.homeTeam} {m.versus()} {game.awayTeam}</ItemTitle>
          {game.venue && <ItemDescription>{game.venue}</ItemDescription>}
        </ItemContent>
      </Item>
      <div className="mt-3 flex flex-wrap items-center gap-3" data-testid="video-score">
        {played && (
          <Badge variant="outline">
            {game.homeScore}–{game.awayScore}
          </Badge>
        )}
        <StatusBadge status={game.statusCode}>{game.statusLabel}</StatusBadge>
        {/* Not a dead end: back to the event this game belongs to. */}
        <ButtonLink variant="outline"
          href={routeHref({ page: "event", id: game.eventId })}
          data-testid="video-event-link"
        >
          {m.view_schedule()}
        </ButtonLink>
      </div>
    </>
  )
}

function Shell({
  gameId,
  heading,
  children,
}: {
  gameId: string
  heading: string
  children: React.ReactNode
}) {
  return (
    <>
      <PageHeader crumbs={[{ label: m.games(), href: routeHref({ page: "game", id: gameId }), testId: "video-back" }]} title={heading}>
        <GameHeading gameId={gameId} />
      </PageHeader>
      <PageInner>{children}</PageInner>
    </>
  )
}

/**
 * Resolve the game, so a menu entry can be a page.
 *
 * `#/broadcast` with no id has to mean something: the sidebar links to a page,
 * not to a fixture, and somebody in another country trying this out should not
 * have to find a game id first. Falls back to whatever is being played now.
 */
function useGameId(id: string | undefined) {
  const { data: fallback, isPending } = useDefaultGame()
  return { gameId: id ?? fallback?.id, resolving: !id && isPending }
}

function NoGame() {
  return (
    <PageInner>
      <EmptyState data-testid="video-no-game">
        <p>{m.video_no_game()}</p>
        <a href={routeHref({ page: "live" })}>{m.nav_live()}</a>
      </EmptyState>
    </PageInner>
  )
}

/** Point a camera at an authorized fixture. */
export function BroadcastPage({ id }: { id?: string }) {
  const { gameId, resolving } = useGameId(id)
  if (resolving) return <PageInner><Loading /></PageInner>
  if (!gameId) return <NoGame />
  return (
    <Shell gameId={gameId} heading={m.video_broadcast_heading()}>
      <GameBroadcast gameId={gameId} />
    </Shell>
  )
}

/** @answers VIEW_LIVE_STREAM */
export function WatchPage({ id }: { id?: string }) {
  const { gameId, resolving } = useGameId(id)
  if (resolving) return <PageInner><Loading /></PageInner>
  if (!gameId) return <NoGame />
  return (
    <Shell gameId={gameId} heading={m.video_watch_heading()}>
      <GameVideo gameId={gameId} />
    </Shell>
  )
}
