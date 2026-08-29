/**
 * The two MoQ surfaces: watch a game, or broadcast one.
 *
 * The React integration has one shape that is not obvious and is worth stating
 * before the code. The elements expose their state as **signals on the DOM
 * node**, and that node does not exist on the first render. `useValue` is a
 * hook, so it cannot be called conditionally on `ref.current` either. So the
 * element is captured into state in an effect, and a *child* component takes it
 * as a prop and calls `useValue` inside — where it is unconditional and the
 * element is guaranteed to exist. Inlining it does not work.
 *
 * Object-valued settings are assigned imperatively for the same reason JSX
 * cannot express them: an attribute carries a string, and the encoder config and
 * reconnect delay are objects.
 */

import { useEffect, useRef, useState } from "react"
import { m } from "../lib/i18n"
import { useQuery } from "@tanstack/react-query"
import { orpc } from "../lib/orpc"
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

/**
 * The relay, from the server, or null.
 *
 * A query rather than a module-level read, because the token is a Worker secret
 * now — which is what keeps it out of the bundle and lets it be rotated without
 * a deploy.
 */
function useRelay() {
  const { data } = useQuery(orpc.moq.config.queryOptions())
  return data?.url && data.token ? { url: data.url, token: data.token } : undefined
}

/** Shown wherever no relay is configured, which is the default. */
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
 * Reporting lives here rather than in each page so a session is recorded once
 * per element regardless of which surface mounted it — and so "how many
 * sessions were there at all" has one answer.
 */
function useMoqElement(
  el: HTMLElement | null,
  role: "watch" | "publish",
  gameId: string,
  encoder: boolean,
) {
  useEffect(() => {
    if (!el) return
    const node = el as HTMLElement & Record<string, unknown>
    // Retry forever. Ten seconds — the default — is shorter than walking
    // behind a bleacher, and the failure presents as the stream just ending.
    node.reload = RECONNECT
    if (encoder) node.encoder = ENCODER

    const startedAt = performance.now()
    let reported = false
    const report = (err?: unknown) => {
      if (reported) return
      reported = true
      reportSession({
        role,
        gameId,
        // What the connection actually used. `@moq/net` records it on the
        // element; absent means it never got that far.
        transport: String(node.transport ?? "none"),
        errorCode: remoteErrorCode(err),
        errorName: err ? errorName(err) : undefined,
        seconds: Math.round((performance.now() - startedAt) / 1000),
      })
    }

    const onError = (e: Event) => report((e as CustomEvent).detail ?? e)
    el.addEventListener("error", onError)
    // Every session, not only the broken ones: a fallback count without a
    // denominator cannot be acted on.
    window.addEventListener("pagehide", () => report())

    return () => {
      el.removeEventListener("error", onError)
      report()
    }
  }, [el, role, gameId, encoder])
}

/** Watch one game's broadcast. */
export function GameVideo({ gameId }: { gameId: string }) {
  const config = useRelay()
  const ref = useRef<HTMLElement>(null)
  const [el, setEl] = useState<HTMLElement | null>(null)

  useEffect(() => setEl(ref.current), [])
  useMoqElement(el, "watch", gameId, false)

  if (!config) return <NoRelay />

  return (
    <div className="moq-surface" data-testid="moq-watch">
      {/* Appears only when the browser is missing something it needs. */}
      <moq-watch-support show="warning" />
      <moq-watch ref={ref} url={relayUrl(config)} name={broadcastName(gameId)} />
    </div>
  )
}

/** Broadcast this game from the device's camera. */
export function GameBroadcast({ gameId }: { gameId: string }) {
  const config = useRelay()
  const ref = useRef<HTMLElement>(null)
  const [el, setEl] = useState<HTMLElement | null>(null)

  useEffect(() => setEl(ref.current), [])
  useMoqElement(el, "publish", gameId, true)

  if (!config) return <NoRelay />

  return (
    <div className="moq-surface" data-testid="moq-publish">
      <moq-publish-support show="warning" />
      {/*
        `announce="source"` so the broadcast is not advertised before the camera
        permission is granted — otherwise a viewer sees a live game that is not
        yet sending anything.
      */}
      <moq-publish
        ref={ref}
        url={relayUrl(config)}
        name={broadcastName(gameId)}
        announce="source"
        preview
      />
    </div>
  )
}
