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
 * **No authorisation, deliberately, and this is not an oversight.** Who may
 * broadcast a game is a product question the model does not answer: `game`
 * carries teams, venue, time, status and scores, and `gameReferee` says who
 * officiates — nothing says who may point a camera. Inventing a rule here would
 * make that decision by accident, in a demo page, where the Product Owner would
 * never find it. The game id comes from the URL and is trusted. When the model
 * grows a BROADCAST_GAME action, this becomes `requireAction` and the check
 * `mise run check:authz` already applies will make sure it does.
 */

import { GameBroadcast, GameVideo } from "../components/moq-video"
import { useDefaultGame, useGame } from "../lib/data"
import type { Route } from "../lib/router"
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
function GameHeading({ gameId, goto }: { gameId: string; goto: (r: Route) => void }) {
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
        <button
          className="more"
          onClick={() => goto({ page: "event", id: game.eventId })}
          data-testid="video-event-link"
        >
          {m.view_schedule()}
        </button>
      </div>
    </>
  )
}

function Shell({
  gameId,
  heading,
  children,
  goto,
}: {
  gameId: string
  heading: string
  children: React.ReactNode
  goto: (r: Route) => void
}) {
  return (
    <>
      <div className="page-header">
        <button className="crumbs" onClick={() => goto({ page: "live" })} data-testid="video-back">
          ← {m.nav_live()}
        </button>
        <h1>{heading}</h1>
        <GameHeading gameId={gameId} goto={goto} />
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

function Empty({ goto }: { goto: (r: Route) => void }) {
  return (
    <div className="empty" data-testid="video-no-game">
      <p>{m.video_no_game()}</p>
      <button onClick={() => goto({ page: "live" })}>{m.nav_live()}</button>
    </div>
  )
}

export function BroadcastPage({ id, goto }: { id?: string; goto: (r: Route) => void }) {
  const { gameId, resolving } = useGameId(id)
  if (resolving) return <div className="empty">{m.loading()}</div>
  if (!gameId) return <Empty goto={goto} />
  return (
    <Shell gameId={gameId} heading={m.video_broadcast_heading()} goto={goto}>
      <GameBroadcast gameId={gameId} />
    </Shell>
  )
}

export function WatchPage({ id, goto }: { id?: string; goto: (r: Route) => void }) {
  const { gameId, resolving } = useGameId(id)
  if (resolving) return <div className="empty">{m.loading()}</div>
  if (!gameId) return <Empty goto={goto} />
  return (
    <Shell gameId={gameId} heading={m.video_watch_heading()} goto={goto}>
      <GameVideo gameId={gameId} />
    </Shell>
  )
}
