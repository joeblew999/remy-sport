/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching"

/**
 * The service worker: the app shell's cache, and the only place a push
 * notification can be displayed.
 *
 * This file exists because a push handler cannot be configuration. vite-plugin-
 * pwa's default `generateSW` writes the whole worker from options in
 * vite.config.ts, and there is no option that means "and also show a
 * notification when one arrives" — so the config asks for `injectManifest`
 * instead, which treats this file as the source and only substitutes
 * `self.__WB_MANIFEST` below.
 *
 * Everything here runs with no page open. That is the point of push, and it is
 * also the constraint: no React, no locale context, no access to the store. The
 * server therefore sends text already translated into the reader's locale
 * rather than a key for this file to look up. See src/api/push.ts.
 */

declare const self: ServiceWorkerGlobalScope

// Injected at build time by injectManifest — the hashed asset list.
precacheAndRoute(self.__WB_MANIFEST)
// Drops precaches from previous deployments. Without it every deploy leaves its
// full asset set behind and the browser's storage quota grows until it evicts
// the lot, taking the current one with it.
cleanupOutdatedCaches()

/** What src/api/push.ts sends. Kept in step by tests/unit/push-payload.test.ts. */
type PushBody = {
  title: string
  body: string
  /** Hash route to open on tap, e.g. "#/games/abc". */
  url: string
  /**
   * Collapse key. A second SCORE_UPDATE for the same game replaces the first
   * rather than stacking, so a close game does not leave forty notifications to
   * dismiss. This is the browser-side half; the push service gets the same
   * value as its `topic` header.
   */
  tag: string
}

self.addEventListener("push", (event) => {
  // A push with no payload is legal, and Apple's push service sends one to
  // verify a subscription. Showing nothing is not an option: every browser
  // requires a visible notification per push and revokes the subscription if a
  // handler stays silent, so an undecodable payload still gets a generic card.
  let payload: Partial<PushBody> = {}
  try {
    payload = (event.data?.json() as PushBody | undefined) ?? {}
  } catch {
    payload = {}
  }

  const title = payload.title ?? "Remy Sport"
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body ?? "",
      // Not the maskable icon: this is drawn as-is, and the maskable one has
      // its mark inset for a safe zone it would not get here.
      icon: "/pwa-192x192.png",
      badge: "/pwa-64x64.png",
      tag: payload.tag ?? "remy",
      // With a tag set, the default is to replace silently — no sound, no
      // vibration. For a live score that is the wrong trade: the replacement
      // *is* the news. `renotify` puts the alert back on the update.
      //
      // Cast because TypeScript's DOM lib omits `renotify` from
      // NotificationOptions. It is in the Notifications standard and is honoured
      // by Chrome and Firefox; the lib is simply behind, and dropping the option
      // to satisfy it would silence every score after the first.
      renotify: Boolean(payload.tag),
      data: { url: payload.url ?? "/" },
    } as NotificationOptions & { renotify: boolean }),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const target = (event.notification.data as { url?: string } | null)?.url ?? "/"

  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
      // Focus a tab we already have rather than opening a second copy of the
      // app. Hash routing means the route is a fragment, so an existing tab can
      // simply be navigated — no reload, and the session survives.
      for (const client of open) {
        if (new URL(client.url).origin !== self.location.origin) continue
        await client.focus()
        if ("navigate" in client) await client.navigate(new URL(target, self.location.origin).href)
        return
      }
      await self.clients.openWindow(target)
    })(),
  )
})

// Push services expire subscriptions on their own schedule. When that happens
// the browser fires this event, and the old endpoint is already dead — so the
// only fix is to subscribe again with the same key and tell the server. Without
// this handler a user silently stops receiving anything and has no way to know.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const key = await fetch("/api/push/key")
        .then((r) => (r.ok ? (r.json() as Promise<{ publicKey: string | null }>) : null))
        .catch(() => null)
      if (!key?.publicKey) return

      const fresh = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key.publicKey,
      })
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subscription: fresh.toJSON(), label: "renewed" }),
      }).catch(() => undefined)
    })(),
  )
})

// autoUpdate: take over as soon as the new worker is installed, rather than
// waiting for every tab to close. registerType in vite.config.ts asks for this
// behaviour; under injectManifest we have to implement it.
self.addEventListener("install", () => {
  void self.skipWaiting()
})
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})
