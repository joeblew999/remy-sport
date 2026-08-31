/**
 * Where a tapped notification should open.
 *
 * A one-line function in its own file because of where it is used: the service
 * worker registers listeners at import time, so nothing can import sw.ts to
 * test it, and `lib/push.ts` pulls in the oRPC client — importing that into the
 * worker would drag the whole API client into the push bundle.
 *
 * ## The bug this exists to keep fixed
 *
 * `notificationclick` resolved the target for one of its two branches and not
 * the other: an already-open tab was navigated to
 * `new URL(target, self.location.origin)`, and `clients.openWindow()` got the
 * raw value. A relative URL inside a service worker resolves against the
 * **worker's own script**, not the site root — the worker is served at
 * `/sw.js`, so a payload of `#/games/abc` opened `/sw.js#/games/abc`, which
 * serves `text/javascript`. Tapping a score notification showed the reader the
 * service worker's source.
 *
 * It survived because the fallback target is `"/"`, an absolute path that
 * resolves the same either way. So every notification with nowhere particular
 * to go worked perfectly, and only the ones carrying a route were broken — on
 * a phone with the app closed, which is the case a push exists for.
 */
export function notificationUrl(raw: string | null | undefined, origin: string): string {
  const resolved = new URL(raw || "/", origin)
  /**
   * Never off-origin.
   *
   * `new URL` honours an absolute URL over its base, so a payload of
   * `https://example.com/` would hand `clients.openWindow` any site on the web.
   * Nothing sends that today — every `url` src/api/push.ts builds is a hash
   * route — so this is not a live hole. It is one line, and the thing on the
   * other side of it is a notification from an app the reader installed opening
   * a page we do not control.
   */
  return resolved.origin === new URL(origin).origin ? resolved.href : new URL("/", origin).href
}
