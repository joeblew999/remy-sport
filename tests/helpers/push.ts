/**
 * A browser that holds a push subscription, and a server that answers about it.
 *
 * `pushState()` decides "on" from `registration.pushManager.getSubscription()`
 * and nothing else, so providing that one method puts the page in exactly the
 * state a subscribed browser is in. The endpoint's realness has no bearing on
 * which branch of our code runs, which is what makes the states reachable at
 * all — WebKit will not mint an APNs subscription headless, and no automation
 * can see a notification arrive.
 *
 * Here rather than in a spec because both push specs had grown their own copy,
 * and a fixture duplicated is a fixture that disagrees with itself later.
 */
import type { Page } from "@playwright/test"

/** The endpoint the stubbed browser holds. Its fingerprint identifies it. */
export const ENDPOINT = "https://web.push.apple.com/TEST-ENDPOINT-FOR-RENDER-TIER"

/**
 * A key of the right SHAPE, because the code decodes it before subscribing.
 *
 * `keyBytes()` base64url-decodes this into the 65 bytes an uncompressed P-256
 * point occupies, and a placeholder like "BTEST" throws in there — before
 * `subscribe()` is reached at all. Two tests then classified the failure as
 * "unknown" and asserted against the wrong branch, which cost a round of
 * chasing the component for a fault in the fixture.
 */
export const VAPID_KEY =
  "BAcOFRwjKjE4P0ZNVFtiaXB3foWMk5qhqK-2vcTL0tng5-71AQgPFh0kKzI5QEdOVVxjanF4f4aNlJuiqbC3vsU"

/**
 * Replace `navigator.serviceWorker` wholesale rather than registering one.
 *
 * The tier serves a built bundle over `vite preview`, and a real registration
 * would pull in the app's own service worker and its caching. The properties
 * provided are the ones `pushState()` and `currentDeviceId()` read.
 */
export async function withSubscription(
  page: Page,
  /**
   * What this browser ALREADY holds. `null` is a browser that has not
   * subscribed yet — the state the toggle reads "Turn on notifications" in.
   */
  endpoint: string | null = ENDPOINT,
  /**
   * Make `subscribe()` reject, as Safari does when it will not create one — a
   * bare AbortError carrying nothing.
   *
   * Distinct from an unsubscribed browser, and the distinction is the point: a
   * browser that refuses cannot be blamed on the session, while one that
   * subscribes fine and is then refused by the SERVER can. They produce
   * different sentences.
   */
  opts: { subscribeRefuses?: boolean } = {},
): Promise<void> {
  await page.addInitScript(([ep, refuses]: [string | null, boolean]) => {
    const make = (e: string) => ({
      endpoint: e,
      expirationTime: null,
      toJSON: () => ({ endpoint: e, keys: { p256dh: "a", auth: "b" } }),
      unsubscribe: async () => true,
    })
    // Held already, or not yet. `subscribe()` always produces one either way —
    // a real PushManager returns a subscription or throws, never null, and a
    // null broke `enablePush`'s rollback in a way no browser could.
    const existing = ep ? make(ep) : null
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      get: () => ({
        ready: Promise.resolve({
          pushManager: {
            getSubscription: async () => existing,
            subscribe: async () => {
              if (refuses) throw new DOMException("failed", "AbortError")
              return existing ?? make("https://web.push.apple.com/NEWLY-SUBSCRIBED")
            },
          },
        }),
        addEventListener() {},
        controller: null,
      }),
    })
  }, [endpoint, opts.subscribeRefuses ?? false] as [string | null, boolean])
}

/** Permission already granted, so `enablePush` reaches the interesting part. */
export async function withNotificationPermission(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(Notification, "permission", { configurable: true, get: () => "granted" })
    Notification.requestPermission = async () => "granted" as NotificationPermission
  })
}

export interface PushAnswers {
  devices?: unknown
  sendTest?: unknown
  /** ≥400 makes the send fail rather than answer. */
  sendTestStatus?: number
  /** ≥400 makes REGISTERING the browser fail — the `authed` half. */
  subscribeStatus?: number
  following?: unknown
}

/**
 * The RPC calls the notification section makes, answered.
 *
 * Register this AFTER any seeding: Playwright gives the last-registered route
 * precedence, and seedCache installs one of its own — getting that backwards
 * meant a counting route never saw a request.
 */
export async function stubPushRpc(page: Page, answers: PushAnswers = {}): Promise<void> {
  await page.route("**/rpc/**", async (route) => {
    const url = route.request().url()
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ json: body }) })
    const refuse = (status: number) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({ json: { message: "refused" } }),
      })

    if (url.includes("notifications/key")) return json({ publicKey: VAPID_KEY })
    if (url.includes("notifications/subscribe") && answers.subscribeStatus) {
      return refuse(answers.subscribeStatus)
    }
    if (url.includes("notifications/devices")) return json(answers.devices ?? { devices: [] })
    if (url.includes("notifications/following")) {
      return json(answers.following ?? { muted: [], following: [] })
    }
    if (url.includes("notifications/sendTest")) {
      if (answers.sendTestStatus && answers.sendTestStatus >= 400) return refuse(answers.sendTestStatus)
      return json(answers.sendTest ?? { sent: 1, gone: 0, failed: 0, configured: true })
    }
    return route.fallback()
  })
}
