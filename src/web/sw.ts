/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching"
import { notificationUrl } from "./lib/notification-url"

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

/**
 * What src/api/push.ts sends — the sender's own type, not a copy of it.
 *
 * `import type` erases at build time, so the worker carries no server code;
 * `mise run check:bundle` asserts that on every run, because a *value* import
 * from the same module would not erase.
 *
 * The two fields that need explaining:
 *   url  hash route to open on tap, e.g. "#/games/abc"
 *   tag  collapse key. A second SCORE_UPDATE for the same game replaces the
 *        first rather than stacking, so a close game does not leave forty
 *        notifications to dismiss. This is the browser-side half; the push
 *        service gets the same value as its `topic` header.
 */
import type { PushBody } from "../api/push"

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
  // Resolved once, for both branches. See lib/notification-url.ts for why
  // openWindow's raw value opened /sw.js#/games/abc.
  const target = notificationUrl(
    (event.notification.data as { url?: string } | null)?.url,
    self.location.origin,
  )

  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
      // Focus a tab we already have rather than opening a second copy of the
      // app. Hash routing means the route is a fragment, so an existing tab can
      // simply be navigated — no reload, and the session survives.
      for (const client of open) {
        if (new URL(client.url).origin !== self.location.origin) continue
        await client.focus()
        if ("navigate" in client) await client.navigate(target)
        return
      }
      await self.clients.openWindow(target)
    })(),
  )
})

/**
 * Push services expire subscriptions on their own schedule. When that happens
 * the browser fires this event, and the old endpoint is already dead — so the
 * only fix is to subscribe again with the same key and tell the server. Without
 * this handler a user silently stops receiving anything and has no way to know.
 *
 * ## The handler used to reproduce the bug it exists to fix
 *
 * Telling the server ended `.catch(() => undefined)`. A single transient
 * network failure — at the moment a push service rotates a subscription, on a
 * device that has just been woken, so exactly when connectivity is worst — left
 * the browser holding a live subscription the server had never heard of.
 *
 * And nothing anywhere would say so. `pushState()` in lib/push.ts reports "on"
 * from `getSubscription()`, which is the *browser's* view; it never asks
 * whether the server knows this endpoint. So the settings page said
 * notifications were on for this device, the server pushed to a dead endpoint
 * forever, and `enablePush()` early-returns unless the state is "off" — so the
 * one control that would have fixed it was not even offered. The reader would
 * have had to disable and re-enable something that claimed to be working.
 *
 * So: retry, because the common case is transient. Then, if it still cannot be
 * told, drop the local subscription — a subscription the server cannot push to
 * is worth nothing, and giving it up is what makes `pushState()` report "off"
 * and the UI offer Enable again. One tap, instead of silence.
 */
const RETRY_DELAYS_MS = [1_000, 3_000]

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const key = await fetch("/api/push/key")
        .then((r) => (r.ok ? (r.json() as Promise<{ publicKey: string | null }>) : null))
        .catch(() => null)
      if (!key?.publicKey) {
        // Nothing to undo: the old subscription is already gone and no new one
        // was made, so `getSubscription()` finds nothing and the UI correctly
        // reports "off" on its own.
        console.warn("[sw] push renewal: no VAPID key available; leaving push off")
        return
      }

      const fresh = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key.publicKey,
      })

      const body = JSON.stringify({ subscription: fresh.toJSON(), label: "renewed" })
      for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
        try {
          const res = await fetch("/api/push/subscribe", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
          })
          if (res.ok) return
          // A 4xx will not become a 2xx by being sent again — the session is
          // gone, or the body is wrong. Only retry what retrying can fix.
          if (res.status < 500) {
            console.warn(`[sw] push renewal refused: ${res.status}`)
            break
          }
        } catch {
          // Network. Worth another go.
        }
        const wait = RETRY_DELAYS_MS[attempt]
        if (wait !== undefined) await new Promise((r) => setTimeout(r, wait))
      }

      // Out of attempts. Better to be visibly off than invisibly broken.
      console.warn("[sw] push renewal: could not reach the server; dropping the subscription")
      await fresh.unsubscribe().catch(() => undefined)
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
