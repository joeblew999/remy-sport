/**
 * The two MoQ surfaces: watch a game, or broadcast one.
 *
 * Two things about these elements are not obvious and cost a blank page each.
 *
 * **They have no shadow root and draw into a child you supply** — a `<video>`
 * for publish, a `<canvas>` for watch. Without one the element is 0×0: it
 * connects to the relay, exchanges a catalog, and shows nothing at all.
 *
 * **That child starts `display: none`.** The publish element reveals its preview
 * only once a source is actually capturing, so a page with no way to choose a
 * source stays empty however well the connection works — which is exactly what
 * this was.
 *
 * The controls are therefore ours rather than the package's chrome: a button
 * that sets `source`, which is also what triggers `getUserMedia`, so the
 * browser's permission prompt is a direct result of the click.
 *
 * The element is captured with a **ref callback**, not an effect. The relay
 * config is a query, so on first render there is no element to capture at all —
 * and `useEffect(..., [])` runs exactly once, storing null and never looking
 * again. Everything downstream then silently did nothing: the Start button
 * returned early, and the two settings that matter were never applied. A ref
 * callback fires whenever the node mounts, which is the only thing that is true
 * regardless of when the config arrives.
 */

import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, orpc } from "../lib/orpc"
import { useGame } from "../lib/data"
import { m } from "../lib/i18n"
import {
  ENCODER,
  RECONNECT,
  broadcastName,
  errorName,
  relayUrl,
  remoteErrorCode,
  reportSession,
} from "../lib/moq"

import "@moq/watch/element"
import "@moq/publish/element"

/** The relay, from the server. Watchers get a subscribe-only token. */
function useRelay(role: "watch" | "publish") {
  const { data } = useQuery(orpc.moq.config.queryOptions({ input: { role } }))
  return data?.url && data.token ? { url: data.url, token: data.token } : undefined
}

/**
 * What the element is actually doing, polled off its own signals.
 *
 * A black rectangle is the worst possible answer to "is this working?" — it
 * looks identical whether the relay is unreachable, nobody is broadcasting, the
 * browser cannot do WebTransport, or the picture simply has not arrived yet.
 * Those need four different responses from whoever is standing there.
 *
 * Polled rather than subscribed: the signals are the package's own reactive
 * primitives and threading them into React costs more than reading them once a
 * second, which is well inside human patience for a status line.
 */
function useMoqStatus(el: HTMLElement | null) {
  const [status, setStatus] = useState<{ connection: string; broadcast: string }>({
    connection: "idle",
    broadcast: "idle",
  })

  useEffect(() => {
    if (!el) return
    const node = el as HTMLElement & {
      connection?: { status?: { peek?: () => unknown } }
      broadcast?: { status?: { peek?: () => unknown } }
    }
    const read = () =>
      setStatus({
        connection: String(node.connection?.status?.peek?.() ?? "idle"),
        broadcast: String(node.broadcast?.status?.peek?.() ?? "idle"),
      })
    read()
    const timer = setInterval(read, 1000)
    return () => clearInterval(timer)
  }, [el])

  return status
}

/** One line a person can act on, in their own language. */
function statusLine(s: { connection: string; broadcast: string }): string {
  if (s.connection === "disconnected" || s.connection === "connecting") {
    return m.video_status_connecting()
  }
  if (s.broadcast === "offline" || s.broadcast === "idle") return m.video_status_waiting()
  if (s.broadcast === "live" || s.broadcast === "active") return m.video_status_live()
  return m.video_status_connecting()
}

/** Shown wherever no relay is configured. */
function NoRelay() {
  return (
    <div className="empty" data-testid="moq-unconfigured">
      {m.video_not_configured()}
    </div>
  )
}

/**
 * Settings that cannot be attributes, plus session reporting.
 *
 * `connection.delay` and `video.config` are the real homes. An earlier version
 * set `node.reload` and `node.encoder`, which do not exist — and assigning an
 * unknown property to a custom element is silent, so both settings the
 * integration calls essential were no-ops that read as done.
 */
function useMoqElement(
  el: HTMLElement | null,
  role: "watch" | "publish",
  gameId: string,
  encoder: boolean,
) {
  useEffect(() => {
    if (!el) return
    const node = el as HTMLElement & {
      connection?: { delay?: unknown }
      video?: { config?: { set?: (v: unknown) => void } }
      transport?: unknown
    }

    // Retry forever. Ten seconds — the default — is shorter than walking behind
    // a bleacher, and the failure presents as the stream simply ending.
    if (node.connection) node.connection.delay = RECONNECT
    if (encoder) node.video?.config?.set?.(ENCODER)

    const startedAt = performance.now()
    let reported = false
    const report = (err?: unknown) => {
      if (reported) return
      reported = true
      reportSession({
        role,
        gameId,
        transport: String(node.transport ?? "none"),
        errorCode: remoteErrorCode(err),
        errorName: err ? errorName(err) : undefined,
        seconds: Math.round((performance.now() - startedAt) / 1000),
      })
    }

    const onError = (e: Event) => report((e as CustomEvent).detail ?? e)
    el.addEventListener("error", onError)
    // Every session, not only the broken ones: a fallback count with no
    // denominator cannot be acted on.
    const onHide = () => report()
    window.addEventListener("pagehide", onHide)

    return () => {
      el.removeEventListener("error", onError)
      window.removeEventListener("pagehide", onHide)
      report()
    }
  }, [el, role, gameId, encoder])
}

/** Watch one game's broadcast. */
export function GameVideo({ gameId }: { gameId: string }) {
  const config = useRelay("watch")
  const [el, setEl] = useState<HTMLElement | null>(null)
  useMoqElement(el, "watch", gameId, false)
  const status = useMoqStatus(el)
  /**
   * Whether anybody is actually broadcasting, from our own table.
   *
   * Polled, because the relay cannot push this — it does not support discovery
   * at all — and because "nobody is live yet" is the answer a viewer needs
   * within seconds of arriving, not whenever they think to reload.
   */
  const { data: game } = useGame(gameId, { refetchInterval: 10_000 })

  if (!config) return <NoRelay />

  return (
    <div className="moq-surface" data-testid="moq-watch">
      {/* Appears only when the browser is missing something it needs. */}
      <moq-watch-support show="warning" />
      <moq-watch ref={setEl} url={relayUrl(config)} name={broadcastName(gameId)}>
        {/* The draw surface. The element has no shadow root; without this it
            subscribes successfully and paints nothing. */}
        <canvas data-testid="moq-canvas" />
      </moq-watch>
      <div className="moq-hint" data-testid="moq-status">
        {game && !game.isBroadcasting ? m.video_status_nobody_live() : statusLine(status)}
        {/* The broadcast being watched, so two devices can be checked against
            each other rather than guessed at. */}
        <span className="moq-name"> · {broadcastName(gameId)}</span>
        <span className="moq-name"> · {status.connection}/{status.broadcast}</span>
      </div>
    </div>
  )
}

/** Broadcast this game from the device's camera. */
export function GameBroadcast({ gameId }: { gameId: string }) {
  const config = useRelay("publish")
  const [el, setEl] = useState<HTMLElement | null>(null)
  const [source, setSource] = useState<"camera" | "screen" | null>(null)
  useMoqElement(el, "publish", gameId, true)
  const qc = useQueryClient()
  const { data: game } = useGame(gameId)

  const withdraw = useMutation({ mutationFn: () => api.games.stopBroadcast({ id: gameId }) })

  /**
   * Heartbeat while broadcasting, and withdraw on the way out.
   *
   * The relay cannot tell anyone that this game is live, so the server only
   * knows because this says so — and only keeps believing it because this keeps
   * saying so. A publisher whose battery dies stops heartbeating and the row
   * goes stale on its own, which is the only failure mode a camera in a gym
   * actually has.
   */
  useEffect(() => {
    if (source === null) return
    const beat = () => void api.games.startBroadcast({ id: gameId }).catch(() => undefined)
    beat()
    const timer = setInterval(beat, 20_000)
    // `pagehide`, not `unload`: it is the one that fires on iOS when an app is
    // backgrounded or the tab is closed, which is exactly when a broadcast ends
    // without anybody pressing stop.
    const bye = () => {
      /**
       * `fetch(..., { keepalive: true })`, not `sendBeacon`.
       *
       * A beacon is always a POST, and this path only answers PUT (start) and
       * DELETE (stop) — so the request fell through `app.all("*")` to the asset
       * store, 404'd, and withdrew nothing. The page looked like it was tidying
       * up after itself and was not.
       *
       * It was not stuck forever: the heartbeat stops with the page and the row
       * goes stale after BROADCAST_STALE_SECONDS, so the game un-advertised
       * itself a minute later. This makes it immediate, which is the difference
       * between a viewer seeing a dead broadcast and not.
       *
       * `keepalive` is what lets a request outlive the document, which is the
       * one thing `sendBeacon` was being used for.
       */
      void fetch(`/api/games/${gameId}/broadcast`, {
        method: "DELETE",
        keepalive: true,
        credentials: "same-origin",
      }).catch(() => undefined)
    }
    window.addEventListener("pagehide", bye)
    return () => {
      clearInterval(timer)
      window.removeEventListener("pagehide", bye)
    }
    // Keyed on the source and the game, which is everything that changes what
    // is being announced. Calling the client directly rather than through a
    // mutation object keeps this honest: a mutation is a new object each render,
    // and depending on it would clear and restart the interval continuously — a
    // heartbeat that never beats.
  }, [source, gameId])

  const start = (which: "camera" | "screen") => {
    const node = el as (HTMLElement & { source?: unknown }) | null
    if (!node) return
    // Setting `source` is what calls getUserMedia, so the permission prompt is
    // a direct result of this click — which browsers require and which is the
    // honest moment to ask.
    node.source = which
    setSource(which)
  }

  const stop = () => {
    const node = el as (HTMLElement & { source?: unknown }) | null
    if (!node) return
    node.source = undefined
    setSource(null)
    withdraw.mutate(undefined, {
      onSuccess: () => qc.invalidateQueries({ queryKey: orpc.games.key() }),
    })
  }

  if (!config) return <NoRelay />

  return (
    <div className="moq-surface" data-testid="moq-publish">
      <moq-publish-support show="warning" />
      {/* `announce="source"` so the broadcast is not advertised before capture
          starts — otherwise a viewer sees a live game sending nothing. */}
      <moq-publish
        ref={setEl}
        url={relayUrl(config)}
        name={broadcastName(gameId)}
        announce="source"
      >
        <video data-testid="moq-preview" muted autoPlay playsInline />
      </moq-publish>

      <div className="moq-controls">
        {game && !game.canBroadcast ? (
          <div className="moq-hint" data-testid="moq-not-permitted">
            {m.video_not_permitted()}
          </div>
        ) : source === null ? (
          <>
            <button
              className="btn primary"
              onClick={() => start("camera")}
              data-testid="moq-start-camera"
            >
              {m.video_start_camera()}
            </button>
            <button className="btn" onClick={() => start("screen")} data-testid="moq-start-screen">
              {m.video_start_screen()}
            </button>
          </>
        ) : (
          <button className="btn" onClick={stop} data-testid="moq-stop">
            {m.video_stop()}
          </button>
        )}
      </div>

      <div className="moq-hint">
        {source === null ? m.video_broadcast_hint() : m.video_broadcasting()}
      </div>
    </div>
  )
}
