/**
 * Score notifications in the native app, while it is running.
 *
 * The Tauri webview has no `PushManager`, so `pushState()` reported
 * "unsupported" and the app could notify nobody. The OS underneath it has a
 * perfectly good notification centre — this routes to that instead, through
 * `tauri-plugin-notification`.
 *
 * ## What this is not
 *
 * It is not push. Nothing arrives while the app is closed: there is no APNs or
 * FCM registration, deliberately — docs/dev/native-notifications.md says why,
 * and the profile page says so to the reader rather than implying delivery we
 * do not have.
 *
 * ## The trigger is a poll, not a socket
 *
 * This was specified against "the existing live-scoring WebSocket". There is
 * not one: no `durable_objects` binding, no `WebSocketPair`, no
 * `@orpc/experimental-durable-iterator`. Live scores are `refetchInterval:
 * 10_000` on `useLiveGames`. So this observes that same query and fires when a
 * score it has already seen changes.
 *
 * That is weaker than a push — bounded by the poll, and only while the app is
 * open, which is the case being served anyway. It is also the right seam: if a
 * socket arrives later, only the observation changes. The payload, the display
 * and the tap routing do not.
 *
 * ## One payload shape
 *
 * It builds a `PushBody` — the same type `src/api/push.ts` sends and
 * `src/web/sw.ts` renders — using the same messages and the same `tag` scheme
 * the server uses, so a reader sees the same card whichever path produced it.
 * Taps go through `notificationUrl()`, the same normaliser as the service
 * worker, origin refusal included.
 */

import type { PushBody } from "../../api/push"
import { m } from "./i18n"
import { notificationUrl } from "./notification-url"

/** Loaded only inside the app — see the note in ./push.ts. */
const plugin = () => import("@tauri-apps/plugin-notification")

/**
 * What a game looks like once `useLiveGames` has localised it.
 *
 * `eventName` is resolved by the caller rather than carried on the game:
 * `GameSchema` has no event name — the server gets it from a join that
 * `games.list` does not return — but it does carry `eventId`, and the app
 * already holds the events list. Looking it up there costs nothing and needs no
 * change to the read path.
 */
export type LiveGame = {
  id: string
  homeTeam: string
  awayTeam: string
  homeScore: number | null
  awayScore: number | null
  eventName?: string | null
}

/**
 * The card for a score change, in the reader's language.
 *
 * Mirrors `announce()` in src/api/games.ts deliberately, down to the tag: the
 * server sends `score:<gameId>` so a second update replaces the first rather
 * than stacking, and a native notification that stacked would be a different
 * experience from the web one for the same event.
 */
export function scoreBody(game: LiveGame): PushBody {
  return {
    title: m.push_score_title({
      home: game.homeTeam,
      away: game.awayTeam,
      homeScore: game.homeScore ?? 0,
      awayScore: game.awayScore ?? 0,
    }),
    // "Live at {event}" with no event reads as "Live at " — so the venue-less
    // case gets the shorter line rather than a dangling preposition.
    body: game.eventName ? m.push_score_body({ event: game.eventName }) : m.status_live(),
    url: `#/games/${game.id}`,
    tag: `score:${game.id}`,
  }
}

/**
 * Show one, and route a tap back into the app.
 *
 * The plugin's `onAction` fires when the reader taps the notification. The app
 * is a single document with hash routing, so "navigate" is assigning the hash —
 * but the target still goes through `notificationUrl()` rather than being used
 * raw, for the reason that function exists: a relative URL resolves against
 * whatever the current document is, and the origin refusal stays in force.
 */
export async function notify(payload: PushBody): Promise<void> {
  const { sendNotification } = await plugin()
  sendNotification({
    title: payload.title,
    body: payload.body,
    // The OS collapse key, the same value the push service gets as `topic`.
    group: payload.tag,
    // Read back by the tap listener below — the plugin hands the whole
    // notification to `onAction`, so the route rides along rather than being
    // parsed back out of the title.
    extra: { url: payload.url },
  })
}

/** Whether `listenForTaps` has already registered. Registering twice would
 *  navigate twice for one tap. */
let listening = false

/**
 * Route a tapped notification, once per app run.
 *
 * The target goes through `notificationUrl()` — the same normaliser the service
 * worker uses, origin refusal included — rather than being assigned raw. The
 * app is one document with hash routing, so navigating is setting the hash, and
 * a value that resolved somewhere else would take the reader out of the app.
 */
export async function listenForTaps(): Promise<void> {
  if (listening) return
  listening = true
  try {
    const { onAction } = await plugin()
    await onAction((notification) => {
      const raw = (notification.extra as { url?: string } | undefined)?.url
      const target = notificationUrl(raw, window.location.origin)
      // Same-origin by construction, so this is a hash change and not a load.
      window.location.href = target
    })
  } catch {
    // No plugin, or an older one without onAction. The notification still
    // shows; it simply does not navigate. Worth degrading rather than
    // preventing the notification itself.
    listening = false
  }
}

/**
 * Which games changed score since last time.
 *
 * Pure, so the decision is testable without a webview: the caller keeps the
 * previous map and hands both in.
 *
 * A game seen for the first time never notifies. Opening the app during a match
 * would otherwise fire one notification per live game immediately, which is
 * noise about something the reader is already looking at — the news is a
 * *change*, and there is no change until there is a previous value.
 */
export function changedScores(
  before: Map<string, string>,
  now: LiveGame[],
): { games: LiveGame[]; seen: Map<string, string> } {
  const seen = new Map<string, string>()
  const games: LiveGame[] = []
  for (const g of now) {
    // Null scores are "not played yet", not zero. A fixture with no score has
    // nothing to report and must not read as 0–0.
    if (g.homeScore === null || g.awayScore === null) continue
    const key = `${g.homeScore}-${g.awayScore}`
    seen.set(g.id, key)
    const was = before.get(g.id)
    if (was !== undefined && was !== key) games.push(g)
  }
  return { games, seen }
}
