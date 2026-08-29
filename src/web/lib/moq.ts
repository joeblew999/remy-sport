/**
 * Media over QUIC: the relay's address, the settings that are not optional, and
 * what we report about a session.
 *
 * A test harness rather than a product feature. It exists to find out how live
 * video behaves from a Thai school gym — on a phone uplink, behind a bleacher,
 * on a browser without WebTransport — and the analytics half is the point.
 * Video that works on a laptop in an office tells us nothing we need.
 */

/**
 * Where the relay is, and the token that scopes us to it.
 *
 * Fetched from `/api/moq/config`, not read from the bundle. The token travels
 * in the relay URL's **path**, which Cloudflare warns puts it in server access
 * logs; a literal in index.html would also put it in git, ship it to every
 * visitor forever, and make rotation a redeploy. As a Worker secret it is none
 * of those.
 *
 * Null when unset, and every surface renders a notice instead of failing —
 * which is the state until a relay is provisioned.
 */
export interface MoqConfig {
  url: string
  token: string
}

/**
 * The URL to connect to: Cloudflare puts the token in the **path**.
 *
 * moq-relay's own scheme is `?jwt=`, and `@moq/net` hands the URL to
 * WebTransport untouched, so the path form works even though it is not what the
 * upstream project documents.
 */
export function relayUrl(c: MoqConfig): string {
  return `${c.url.replace(/\/$/, "")}/${c.token}`
}

/**
 * A broadcast name derived from the game.
 *
 * The `.hang` suffix is load-bearing — it is what selects the hang catalog
 * format. A name without it connects and then carries nothing a player can read.
 */
export function broadcastName(gameId: string): string {
  return `${gameId}.hang`
}

/**
 * Retry forever.
 *
 * `@moq/net` defaults `timeout` to 10_000: ten seconds of retries and then it
 * stops, permanently. That is shorter than walking behind a bleacher, and the
 * failure looks like the stream simply ending. `0` means unlimited, and it is
 * the single highest-value setting in this whole integration.
 */
export const RECONNECT = { initial: 1000, multiplier: 2, max: 5000, timeout: 0 } as const

/**
 * An explicit ceiling, because the automatic one cannot work here.
 *
 * The encoder sizes bitrate from resolution and framerate, then clamps it to
 * measured bandwidth — but that measurement arrives over MoQ's PROBE stream,
 * which the IETF wire format Cloudflare speaks does not carry. With no PROBE the
 * clamp never happens, and a phone on a weak uplink attempts a bitrate it cannot
 * sustain and stalls. Setting `maxBitrate` takes precedence and skips the
 * bandwidth path entirely.
 */
export const ENCODER = { maxBitrate: 2_000_000, maxPixels: 1280 * 720 } as const

/** What we learned about one session, whether or not it worked. */
export interface SessionReport {
  role: "watch" | "publish"
  gameId: string
  /** "webtransport" | "websocket" | "none" — which path the connection took. */
  transport: string
  /** The peer's own code, raw. Absent when nothing failed. */
  errorCode?: number
  /** The error's class name, for grouping. */
  errorName?: string
  /** How long the session lasted, in seconds. */
  seconds?: number
}

/**
 * Report **every** session, not only the failures.
 *
 * "Forty sessions fell back to WebSocket" means nothing without the
 * denominator: it is a different world at sixty sessions than at three
 * thousand, and only one of those is worth acting on.
 *
 * `sendBeacon`, not `fetch`, because the interesting moment is a page closing or
 * a connection that has already died — exactly when a fetch is cancelled.
 */
export function reportSession(r: SessionReport): void {
  try {
    if (typeof navigator === "undefined" || !navigator.sendBeacon) return
    const body = JSON.stringify({
      event: "moq.session",
      blobs: [r.role, r.gameId, r.transport, r.errorName ?? ""],
      doubles: [r.errorCode ?? 0, r.seconds ?? 0],
    })
    navigator.sendBeacon("/api/analytics", new Blob([body], { type: "application/json" }))
  } catch {
    // Telemetry never breaks the thing it measures.
  }
}

/**
 * The peer's error code, or undefined if this is not one.
 *
 * Branch on this rather than feature-detecting `WebTransportError`: `@moq/net`
 * normalises the native transport error *and* the WebSocket fallback's error
 * into `RemoteError`, and a `WebTransportError` check silently misses every
 * fallback session — the exact population most worth measuring. Their own source
 * says so.
 *
 * Checked structurally rather than with `instanceof`, so this module does not
 * have to import the transport just to read an error, and so a second copy of
 * `@moq/net` in the graph cannot make the check quietly false.
 */
export function remoteErrorCode(err: unknown): number | undefined {
  const e = err as { name?: string; code?: unknown } | null
  return e?.name === "RemoteError" && typeof e.code === "number" ? e.code : undefined
}

export function errorName(err: unknown): string {
  const e = err as { name?: string } | null
  return e?.name ?? "Error"
}
