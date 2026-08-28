/**
 * Turning push on in this browser, and knowing why it will not turn on.
 *
 * Push has more ways to be unavailable than almost anything else on the web,
 * and they are not interchangeable — a reader who is told "notifications are
 * off" when the real answer is "install this app first" will keep pressing a
 * button that cannot work. So this reports a *reason*, and the UI says the
 * useful thing for each one.
 *
 * The iOS rule is the one that catches people: Safari supports Web Push only
 * for a site added to the Home Screen. In a normal Safari tab `PushManager`
 * does not exist at all, so feature detection alone reads as "unsupported" on a
 * device that supports it perfectly well once installed.
 */

import { api } from "./orpc"

export type PushState =
  /** Not a browser that can do this — or a Tauri webview, where it is native. */
  | { status: "unsupported" }
  /** iOS Safari, in a tab. Supported, but only once added to the Home Screen. */
  | { status: "needs-install" }
  /** The deployment has no VAPID keys. Nothing the reader can do. */
  | { status: "not-configured" }
  /** The reader said no. Only they can undo it, in browser settings. */
  | { status: "denied" }
  | { status: "off" }
  | { status: "on" }

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

/**
 * Standalone display mode — the app was installed rather than opened in a tab.
 *
 * Two checks because they disagree: `display-mode: standalone` is the standard
 * and `navigator.standalone` is Apple's, and older iOS only sets the latter.
 */
const isInstalled = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

const isIos = () =>
  /iP(hone|ad|od)/.test(navigator.userAgent) ||
  // iPadOS 13+ reports itself as a Mac. A Mac with a touchscreen is an iPad.
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)

/** What this browser can do right now, before the reader is asked anything. */
export async function pushState(): Promise<PushState> {
  if (typeof window === "undefined" || isTauri()) return { status: "unsupported" }

  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    // On iOS the API is genuinely absent until installed, so "unsupported" here
    // would be a lie that hides the one action that fixes it.
    return isIos() && !isInstalled() ? { status: "needs-install" } : { status: "unsupported" }
  }
  if (Notification.permission === "denied") return { status: "denied" }

  const { publicKey } = await api.notifications.key()
  if (!publicKey) return { status: "not-configured" }

  const registration = await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()
  return existing ? { status: "on" } : { status: "off" }
}

/**
 * VAPID keys travel as base64url text and `subscribe()` wants bytes.
 *
 * base64url is not base64: `-` and `_` stand in for `+` and `/`, and the
 * padding is dropped. `atob` accepts neither, and the failure is not an
 * exception — it decodes to the wrong bytes and the push service rejects every
 * message with an opaque 400.
 */
function keyBytes(base64url: string): ArrayBuffer {
  const padded = base64url.padEnd(base64url.length + ((4 - (base64url.length % 4)) % 4), "=")
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"))
  // An ArrayBuffer rather than the view: `applicationServerKey` is typed
  // against `ArrayBufferView<ArrayBuffer>`, and a Uint8Array is generic over
  // ArrayBufferLike — which includes SharedArrayBuffer and so does not match.
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i)
  return bytes.buffer
}

/** A name the reader will recognise in a list of their own devices. */
function deviceLabel(): string {
  const ua = navigator.userAgent
  const platform = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Macintosh/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : "Browser"
  const browser = /CriOS|Chrome/.test(ua)
    ? "Chrome"
    : /Firefox/.test(ua)
      ? "Firefox"
      : /Safari/.test(ua)
        ? "Safari"
        : "browser"
  return `${browser} on ${platform}`
}

/**
 * Ask for permission and register this browser.
 *
 * Returns the state afterwards rather than a boolean, so a refusal and a
 * misconfigured deployment stay distinguishable to the caller.
 */
export async function enablePush(locale: string): Promise<PushState> {
  const before = await pushState()
  if (before.status !== "off") return before

  // Must be called from a user gesture. Every browser rejects a permission
  // prompt that was not asked for, which is why nothing here runs on load.
  const permission = await Notification.requestPermission()
  if (permission !== "granted") return { status: "denied" }

  const { publicKey } = await api.notifications.key()
  if (!publicKey) return { status: "not-configured" }

  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.subscribe({
    // Required, and not merely advisory: a subscription that does not promise a
    // visible notification for every push is refused outright by Chrome.
    userVisibleOnly: true,
    applicationServerKey: keyBytes(publicKey),
  })

  await api.notifications.subscribe({
    subscription: subscription.toJSON() as {
      endpoint: string
      expirationTime?: number | null
      keys: { p256dh: string; auth: string }
    },
    label: deviceLabel(),
    locale: locale as "en",
  })
  return { status: "on" }
}

/** Stop pushing to this browser — both halves, so neither is left orphaned. */
export async function disablePush(): Promise<PushState> {
  if (!("serviceWorker" in navigator)) return { status: "unsupported" }
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return { status: "off" }

  // Server first. If the browser end were dropped first and the call then
  // failed, the row would live on with an endpoint nothing can cancel, and the
  // reader would keep getting notifications with no way to stop them.
  await api.notifications.unsubscribe({ endpoint: subscription.endpoint })
  await subscription.unsubscribe()
  return { status: "off" }
}
