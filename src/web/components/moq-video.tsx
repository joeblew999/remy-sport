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
 * The element's signals live on the DOM node, which does not exist on first
 * render and cannot be read conditionally by a hook — hence capturing the
 * element into state in an effect.
 */

import { useEffect, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { orpc } from "../lib/orpc"
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
  const ref = useRef<HTMLElement>(null)
  const [el, setEl] = useState<HTMLElement | null>(null)

  useEffect(() => setEl(ref.current), [])
  useMoqElement(el, "watch", gameId, false)

  if (!config) return <NoRelay />

  return (
    <div className="moq-surface" data-testid="moq-watch">
      {/* Appears only when the browser is missing something it needs. */}
      <moq-watch-support show="warning" />
      <moq-watch ref={ref} url={relayUrl(config)} name={broadcastName(gameId)}>
        {/* The draw surface. The element has no shadow root; without this it
            subscribes successfully and paints nothing. */}
        <canvas data-testid="moq-canvas" />
      </moq-watch>
      <div className="moq-hint">{m.video_watch_hint()}</div>
    </div>
  )
}

/** Broadcast this game from the device's camera. */
export function GameBroadcast({ gameId }: { gameId: string }) {
  const config = useRelay("publish")
  const ref = useRef<HTMLElement>(null)
  const [el, setEl] = useState<HTMLElement | null>(null)
  const [source, setSource] = useState<"camera" | "screen" | null>(null)

  useEffect(() => setEl(ref.current), [])
  useMoqElement(el, "publish", gameId, true)

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
  }

  if (!config) return <NoRelay />

  return (
    <div className="moq-surface" data-testid="moq-publish">
      <moq-publish-support show="warning" />
      {/* `announce="source"` so the broadcast is not advertised before capture
          starts — otherwise a viewer sees a live game sending nothing. */}
      <moq-publish
        ref={ref}
        url={relayUrl(config)}
        name={broadcastName(gameId)}
        announce="source"
      >
        <video data-testid="moq-preview" muted autoPlay playsInline />
      </moq-publish>

      <div className="moq-controls">
        {source === null ? (
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
