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
      <div className="tagline" data-testid="video-game">
        {game.homeTeam} {m.versus()} {game.awayTeam}
        {game.venue ? ` · ${game.venue}` : ""}
      </div>
      <div className="video-score" data-testid="video-score">
        {played && (
          <span className="score">
            {game.homeScore}–{game.awayScore}
          </span>
        )}
        <span className="status">{game.statusLabel}</span>
        {/* Not a dead end: back to the event this game belongs to. */}
        <a
          className="more"
          href={routeHref({ page: "event", id: game.eventId })}
          data-testid="video-event-link"
        >
          {m.view_schedule()}
        </a>
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
      <div className="page-header">
        <a className="crumbs" href={routeHref({ page: "game", id: gameId })} data-testid="video-back">
          ← {m.games()}
        </a>
        <h1>{heading}</h1>
        <GameHeading gameId={gameId} />
      </div>
      <div className="page-inner">{children}</div>
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

function Empty() {
  return (
    <div className="empty" data-testid="video-no-game">
      <p>{m.video_no_game()}</p>
      <a href={routeHref({ page: "live" })}>{m.nav_live()}</a>
    </div>
  )
}

/** Point a camera at an authorized fixture. */
export function BroadcastPage({ id }: { id?: string }) {
  const { gameId, resolving } = useGameId(id)
  if (resolving) return <div className="empty">{m.loading()}</div>
  if (!gameId) return <Empty />
  return (
    <Shell gameId={gameId} heading={m.video_broadcast_heading()}>
      <GameBroadcast gameId={gameId} />
    </Shell>
  )
}

/** @answers VIEW_LIVE_STREAM */
export function WatchPage({ id }: { id?: string }) {
  const { gameId, resolving } = useGameId(id)
  if (resolving) return <div className="empty">{m.loading()}</div>
  if (!gameId) return <Empty />
  return (
    <Shell gameId={gameId} heading={m.video_watch_heading()}>
      <GameVideo gameId={gameId} />
    </Shell>
  )
}
