import { describe, it, expect } from "bun:test"
import { notificationUrl } from "../../src/web/lib/notification-url"

/**
 * Where a tapped notification opens.
 *
 * `notificationclick` resolved its target for one of two branches and not the
 * other: an open tab was navigated to a resolved URL, and `openWindow()` got
 * the raw payload value. Inside a service worker a relative URL resolves
 * against the **worker's script**, not the site root — the worker is served at
 * `/sw.js`, so `#/games/abc` opened `/sw.js#/games/abc`, which serves
 * `text/javascript`. The reader tapped a score and got source code.
 *
 * The origin is passed in rather than read from `self`, which is what makes
 * this testable at all: sw.ts registers listeners at import time, so no test
 * can import it.
 */

const ORIGIN = "https://dev-remy.ubuntusoftware.net"
/** What a bare relative URL would have resolved against inside the worker. */
const SW = "https://dev-remy.ubuntusoftware.net/sw.js"

describe("notificationUrl", () => {
  it("resolves a hash route against the site root, not the worker script", () => {
    expect(notificationUrl("#/games/abc", ORIGIN)).toBe(`${ORIGIN}/#/games/abc`)
    // The bug, stated: this is what the raw value produced, and it is a
    // different page — one that serves JavaScript.
    expect(new URL("#/games/abc", SW).href).toBe(`${ORIGIN}/sw.js#/games/abc`)
    expect(notificationUrl("#/games/abc", ORIGIN)).not.toBe(new URL("#/games/abc", SW).href)
  })

  it("is unchanged for the fallback target, which is why nobody noticed", () => {
    // "/" is absolute, so it resolved correctly either way. Every notification
    // with nowhere particular to go worked, and only the ones carrying a route
    // were broken.
    expect(notificationUrl("/", ORIGIN)).toBe(`${ORIGIN}/`)
    expect(new URL("/", SW).href).toBe(`${ORIGIN}/`)
  })

  it("falls back to the root for a payload with no url", () => {
    // A push with no payload is legal — Apple sends one to verify a
    // subscription — so this is reached in normal operation, not just on error.
    expect(notificationUrl(undefined, ORIGIN)).toBe(`${ORIGIN}/`)
    expect(notificationUrl(null, ORIGIN)).toBe(`${ORIGIN}/`)
    expect(notificationUrl("", ORIGIN)).toBe(`${ORIGIN}/`)
  })

  it("keeps every hash route the sender actually produces", () => {
    // The routes src/api/push.ts builds. Each has to survive resolution intact:
    // the fragment is the whole address under hash routing.
    for (const route of ["#/games/gam_001", "#/event/evt_002", "#/live", "#/profile"]) {
      expect(notificationUrl(route, ORIGIN)).toBe(`${ORIGIN}/${route}`)
    }
  })

  it("refuses to send a reader off-origin", () => {
    // `new URL` honours an absolute URL over its base, so without the guard a
    // payload of "https://example.com/" would hand `clients.openWindow` any
    // site on the web — a notification from an app the reader installed,
    // opening a page we do not control. Nothing sends that today; it is one
    // line to make sure nothing can.
    expect(notificationUrl("https://example.com/phish", ORIGIN)).toBe(`${ORIGIN}/`)
    expect(notificationUrl("//example.com/phish", ORIGIN)).toBe(`${ORIGIN}/`)
    // A same-origin absolute URL is still fine.
    expect(notificationUrl(`${ORIGIN}/#/live`, ORIGIN)).toBe(`${ORIGIN}/#/live`)
  })
})
