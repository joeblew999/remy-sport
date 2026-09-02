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
// src/domain is shared ground — the one place the SPA and the Worker may both
// import from. Both halves of this fingerprint must agree exactly, and two
// copies of a hash in two files is how they would stop agreeing.
import { deviceFingerprint } from "../../domain/device-fingerprint"

export type PushState =
  /** Not a browser that can do this. */
  | { status: "unsupported" }
  /**
   * The native app, where notifications are the OS's and not the browser's.
   *
   * A distinct state rather than "on", because what it offers is genuinely
   * narrower: the app shows notifications *while it is running*. Nothing
   * arrives when it is closed — there is no APNs or FCM registration, by
   * decision, see docs/dev/native-notifications.md. Collapsing it into "on"
   * would promise the reader delivery we do not have.
   */
  | { status: "native" }
  /** Native, and the reader has not been asked yet. */
  | { status: "native-off" }
  /** Native, and the reader said no. Only the OS settings can undo it. */
  | { status: "native-denied" }
  /** iOS Safari, in a tab. Supported, but only once added to the Home Screen. */
  | { status: "needs-install" }
  /** The deployment has no VAPID keys. Nothing the reader can do. */
  | { status: "not-configured" }
  /**
   * We could not find out.
   *
   * The state this union could not express, and the gap was visible: asking
   * the server for the VAPID key is a network call, and when it failed
   * `pushState()` rejected. The caller's `state` stayed null, and null renders
   * the entire notifications section as nothing — no control, no message, no
   * explanation.
   *
   * That is the same symptom as the bug this whole thread started from, from a
   * different cause, and the same mistake: invisibly broken instead of visibly
   * off. A reason the reader can act on — try again — is what the rest of this
   * union exists for.
   */
  | { status: "unknown" }
  /** The reader said no. Only they can undo it, in browser settings. */
  | { status: "denied" }
  | { status: "off" }
  | { status: "on" }

/**
 * The native app, decided synchronously and with no network.
 *
 * Exported because the app root needs to know *before* asking anything:
 * `pushState()` fetches the VAPID key, and calling it on every page load in a
 * browser is a round trip for an answer no browser needs. It also rejected
 * unhandled where there is no Worker, which is how the render tier found this.
 */
export const isNativeApp = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

const isTauri = isNativeApp

/**
 * The notification plugin, loaded only inside the app.
 *
 * A static import would pull the Tauri IPC shim into the web bundle, where
 * `__TAURI_INTERNALS__` does not exist and every call throws. Dynamic, so a
 * browser never evaluates it — and `check:bundle` would catch it if this
 * regressed into the service worker.
 */
const plugin = () => import("@tauri-apps/plugin-notification")

/** What the OS will let the app do, asked without prompting anybody. */
async function nativeState(): Promise<PushState> {
  try {
    const { isPermissionGranted } = await plugin()
    return (await isPermissionGranted()) ? { status: "native" } : { status: "native-off" }
  } catch {
    // The plugin is not registered, or the capability is missing. Reporting
    // "unsupported" is honest: from the reader's side there is no way to turn
    // this on, and it is not something they did.
    return { status: "unsupported" }
  }
}

/**
 * Ask the OS, once, from a user gesture.
 *
 * Separate from `enablePush` below because nothing about it is Web Push: no
 * VAPID key, no subscription, no server round trip. There is nothing to tell
 * the server — the app notifies itself, so a `userNotificationChannel` row
 * would describe a delivery path that does not exist.
 */
export async function enableNative(): Promise<PushState> {
  try {
    const { isPermissionGranted, requestPermission } = await plugin()
    if (await isPermissionGranted()) return { status: "native" }
    const granted = await requestPermission()
    // "default" means dismissed rather than refused — asking again later is
    // legitimate, so it is not the same as denied.
    if (granted === "granted") return { status: "native" }
    return granted === "denied" ? { status: "native-denied" } : { status: "native-off" }
  } catch {
    return { status: "unsupported" }
  }
}

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

/**
 * What this browser can do right now, before the reader is asked anything.
 *
 * **This never rejects.** Every await inside it is guarded, and the failures
 * come back as `unknown` — a state the reader can see and retry. That is a
 * contract two call sites rely on, so neither needs a `.catch`, and a `.catch`
 * is what hid this in the first place: `void pushState().then(...)` satisfies
 * no-floating-promises because `void` asserts you meant to ignore it, so no
 * lint rule was ever going to object.
 *
 * `tests/render/no-backend.spec.ts` is what holds it: every route, no backend,
 * zero unhandled rejections.
 *
 * The Tauri branch used to return "unsupported" and stop, which was true of
 * `PushManager` and false of the app: a webview has no push API, and the OS
 * underneath it has a perfectly good notification centre. So the native app
 * reported "this browser cannot show notifications" on a machine that plainly
 * could, and there was nothing behind the message to fix.
 */
/**
 * What this browser would be called on the server's device list, or null.
 *
 * `pushState()` answers "does this browser hold a subscription", which is a
 * purely local question — and answering only that is how a device can report
 * itself switched on while the server has no row for it. Nothing then reaches
 * it, and the page shows a Disable button and a working-looking test.
 *
 * This is the other half: the same fingerprint the Worker publishes for each
 * registered device, computed over the subscription this browser actually
 * holds. Matching the two is what lets the list say "this device" — and, more
 * usefully, notice when this device is missing from it.
 *
 * The case that made it necessary: on macOS a web app added to the Dock has its
 * own storage, so it has its own service worker registration and its own
 * subscription. A reader inside the installed app saw "Safari on Mac" in the
 * list and reasonably read it as confirmation, when it was a different browser
 * entirely.
 *
 * Null for every reason this cannot be answered — no service worker, no
 * subscription, a registration that never becomes ready — because all of them
 * mean the same thing to the caller: there is no local device to match.
 */
export async function currentDeviceId(): Promise<string | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null
  try {
    const registration = await navigator.serviceWorker.ready
    const existing = await registration.pushManager.getSubscription()
    return existing ? await deviceFingerprint(existing.endpoint) : null
  } catch {
    return null
  }
}

export async function pushState(): Promise<PushState> {
  if (typeof window === "undefined") return { status: "unsupported" }
  if (isTauri()) return nativeState()

  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    // On iOS the API is genuinely absent until installed, so "unsupported" here
    // would be a lie that hides the one action that fixes it.
    return isIos() && !isInstalled() ? { status: "needs-install" } : { status: "unsupported" }
  }
  if (Notification.permission === "denied") return { status: "denied" }

  /**
   * Asking the server. The one network call in here, and the one that failed.
   *
   * "The deployment has no keys" and "we could not reach the deployment" are
   * different answers with different fixes, so a rejection becomes `unknown`
   * rather than `not-configured` — telling a reader push is switched off for
   * this deployment when their wifi dropped would send them to the wrong place.
   */
  let publicKey: string | null
  try {
    ;({ publicKey } = await api.notifications.key())
  } catch {
    return { status: "unknown" }
  }
  if (!publicKey) return { status: "not-configured" }

  try {
    const registration = await navigator.serviceWorker.ready
    const existing = await registration.pushManager.getSubscription()
    return existing ? { status: "on" } : { status: "off" }
  } catch {
    // A service worker that never becomes ready, or a push manager that
    // refuses. Also "we could not find out" — and also worth a retry, since a
    // registration in flight becomes ready a moment later.
    return { status: "unknown" }
  }
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

  /**
   * Subscribe, replacing a subscription pinned to a different key.
   *
   * `subscribe()` throws InvalidStateError when this browser already holds one
   * with a different `applicationServerKey` — which happens whenever VAPID keys
   * are rotated, and between environments that have their own. The old
   * subscription can never be pushed to with the current keys, so keeping it is
   * strictly worse than replacing it.
   */
  let subscription: PushSubscription
  const options = {
    // Required, and not merely advisory: a subscription that does not promise a
    // visible notification for every push is refused outright by Chrome.
    userVisibleOnly: true,
    applicationServerKey: keyBytes(publicKey),
  }
  try {
    subscription = await registration.pushManager.subscribe(options)
  } catch {
    const stale = await registration.pushManager.getSubscription()
    if (!stale) throw new Error("push-subscribe-failed")
    await stale.unsubscribe()
    subscription = await registration.pushManager.subscribe(options)
  }

  /**
   * Register it, and undo the browser half if that fails.
   *
   * This is `authed`, so a lapsed session throws — and it used to throw with a
   * live browser subscription already created. The reader was left holding a
   * subscription the server has no row for: `pushState()` reads "on" from the
   * local one, the page offers Disable and a test button, and nothing can ever
   * be delivered. The failure created the ghost state that
   * `device_not_registered` exists to report.
   *
   * Rolling back leaves both halves off, which is a state a reader can act on
   * by pressing the button again.
   */
  try {
    await api.notifications.subscribe({
      subscription: subscription.toJSON() as {
        endpoint: string
        expirationTime?: number | null
        keys: { p256dh: string; auth: string }
      },
      label: deviceLabel(),
      locale: locale as "en",
    })
  } catch (e) {
    await subscription.unsubscribe().catch(() => {
      /* best effort: the server call already failed, and this is the cleanup */
    })
    throw e
  }
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
