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

/** The game's own line, so a broadcaster can see they picked the right one. */
function GameHeading({ gameId }: { gameId: string }) {
  const { data: game } = useGame(gameId)
  if (!game) return null
  return (
    <div className="tagline" data-testid="video-game">
      {game.homeTeam} {m.versus()} {game.awayTeam}
      {game.venue ? ` · ${game.venue}` : ""}
    </div>
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
        <div className="crumbs">{m.nav_live()}</div>
        <h1>{heading}</h1>
        <GameHeading gameId={gameId} />
        <p className="meta">{m.video_harness_note()}</p>
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
    <Shell gameId={gameId} heading={m.video_broadcast_heading()}>
      <GameBroadcast gameId={gameId} />
    </Shell>
  )
}

export function WatchPage({ id, goto }: { id?: string; goto: (r: Route) => void }) {
  const { gameId, resolving } = useGameId(id)
  if (resolving) return <div className="empty">{m.loading()}</div>
  if (!gameId) return <Empty goto={goto} />
  return (
    <Shell gameId={gameId} heading={m.video_watch_heading()}>
      <GameVideo gameId={gameId} />
    </Shell>
  )
}
