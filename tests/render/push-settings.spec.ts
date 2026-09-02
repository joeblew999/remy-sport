import { test, expect } from "./fixture"
import { seedCache } from "../helpers/seed-cache"
import { sessionKey } from "../../src/web/lib/session"
import { deviceFingerprint } from "../../src/domain/device-fingerprint"

/**
 * What the push settings SAY, for the states a real subscription is needed to
 * reach — and which therefore went untested until one of them shipped broken.
 *
 * ## What this can and cannot do
 *
 * It cannot deliver a notification. WebKit will not mint an APNs subscription
 * headless, Apple will not deliver to a browser that is not there, and no
 * automation can see macOS Notification Center. That half stays manual and
 * should be honest about it.
 *
 * What it can do is everything up to the wire. `pushState()` decides "on" from
 * `registration.pushManager.getSubscription()` and nothing else, so a stub in
 * an init script puts the page in exactly the state a subscribed browser is in.
 * That is not a weaker test than a real subscription would give: the states
 * being checked are branches in our own code, and the endpoint's realness has
 * no bearing on which branch runs.
 *
 * ## The bug this exists for
 *
 * The component rendered `{test.data && ...}` and had no error branch, so a
 * refused request produced NO output — the reported symptom was "I pressed send
 * test notification and nothing happened", and it was literally true. Reaching
 * it needed status "on", which needed a subscription, which is why nothing
 * caught it.
 *
 * The way in is easier than it looks: `notifications.key` is `pub` and
 * `getSubscription()` is local, so neither needs a session — the whole block
 * renders for a signed-out reader whose click can only ever be refused.
 */

/**
 * Signed out, and RESOLVED — not merely absent.
 *
 * `useSession` reports `loading: q.isPending`, so an unseeded session query on
 * a tier with no backend stays pending through its retries and the devices page
 * renders only its loading branch. A signed-out visitor really does get 200 with
 * a null body (see fetchSession), so this is the honest shape rather than a
 * convenience.
 */
const signedOut = {
  queryKey: sessionKey as unknown as readonly unknown[],
  data: null,
}

const signedIn = {
  queryKey: sessionKey as unknown as readonly unknown[],
  data: {
    user: { id: "usr_admin_001", email: "admin@remysport.test", name: "Admin", role: "admin" },
    session: { activeOrganizationId: null, impersonatedBy: null },
  },
}

/**
 * A key of the right SHAPE, because the code decodes it before subscribing.
 *
 * `keyBytes()` base64url-decodes this into the 65 bytes an uncompressed P-256
 * point occupies, and a placeholder like "BTEST" throws in there — before
 * `subscribe()` is reached at all. Two tests then classified the failure as
 * "unknown" and asserted against the wrong branch, which cost a round of
 * chasing the component for a fault in the fixture.
 */
const VAPID_KEY = "BAcOFRwjKjE4P0ZNVFtiaXB3foWMk5qhqK-2vcTL0tng5-71AQgPFh0kKzI5QEdOVVxjanF4f4aNlJuiqbC3vsU"

/** The endpoint the stubbed browser holds. Its fingerprint is asserted below. */
const ENDPOINT = "https://web.push.apple.com/TEST-ENDPOINT-FOR-RENDER-TIER"

/**
 * A browser that holds a push subscription.
 *
 * Replaces `navigator.serviceWorker` wholesale rather than registering a real
 * worker: the tier serves a built bundle over `vite preview`, and a real
 * registration would pull in the app's own service worker and its caching. The
 * two properties `pushState()` reads are the two provided.
 */
const withSubscription = (endpoint: string) => (page: Parameters<typeof seedCache>[0]) =>
  page.addInitScript((ep: string) => {
    const subscription = { endpoint: ep, expirationTime: null, toJSON: () => ({ endpoint: ep }) }
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      get: () => ({
        ready: Promise.resolve({ pushManager: { getSubscription: async () => subscription } }),
        addEventListener() {},
        controller: null,
      }),
    })
  }, endpoint)

/** The VAPID key call, which `pushState()` makes before it looks locally. */
async function stubRpc(
  page: Parameters<typeof seedCache>[0],
  answers: { devices?: unknown; sendTest?: unknown; sendTestStatus?: number; subscribeStatus?: number },
) {
  await page.route("**/rpc/**", async (route) => {
    const url = route.request().url()
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ json: body }) })

    if (url.includes("notifications/key")) return json({ publicKey: VAPID_KEY })
    if (url.includes("notifications/subscribe") && answers.subscribeStatus) {
      return route.fulfill({
        status: answers.subscribeStatus,
        contentType: "application/json",
        body: JSON.stringify({ json: { message: "refused" } }),
      })
    }
    if (url.includes("notifications/devices")) return json(answers.devices ?? { devices: [] })
    if (url.includes("notifications/sendTest")) {
      if (answers.sendTestStatus && answers.sendTestStatus >= 400) {
        return route.fulfill({
          status: answers.sendTestStatus,
          contentType: "application/json",
          body: JSON.stringify({ json: { message: "refused" } }),
        })
      }
      return json(answers.sendTest ?? { sent: 1, gone: 0, failed: 0, configured: true })
    }
    return route.fallback()
  })
}

test.describe("Push settings, with a subscription this browser actually holds", () => {
  test("a refused send says so, instead of rendering nothing", async ({ page }) => {
    await withSubscription(ENDPOINT)(page)
    await seedCache(page, [signedIn])
    await stubRpc(page, { sendTestStatus: 401 })

    await page.goto("/#/devices")
    await page.getByTestId("push-test").click()

    // The whole bug: this used to be a click with no consequence on screen.
    await expect(page.getByTestId("push-test-error")).toBeVisible()
  })

  test("the button is not offered to somebody who is not signed in", async ({ page }) => {
    await withSubscription(ENDPOINT)(page)
    await seedCache(page, [signedOut])
    await stubRpc(page, {})
    // Signed out, but the push STATE still renders: notifications.key is public
    // and getSubscription is local, so neither needs a session. That is how the
    // refusal was reached — the block was there, the action could not work.
    await page.goto("/#/devices")

    await expect(page.getByTestId("push-test-signed-out")).toBeVisible()
    await expect(page.getByTestId("push-test")).toHaveCount(0)
  })

  test("a send the push service refused is not reported as success", async ({ page }) => {
    await withSubscription(ENDPOINT)(page)
    await seedCache(page, [signedIn])
    await stubRpc(page, { sendTest: { sent: 0, gone: 0, failed: 1, configured: true } })

    await page.goto("/#/devices")
    await page.getByTestId("push-test").click()

    const result = page.getByTestId("push-test-result")
    await expect(result).toBeVisible()
    // `failed` used to be discarded before it reached here, and this read
    // "Sent to 0 device(s)" — the same sentence as having no devices at all.
    await expect(result).toContainText(/refused/i)
  })

  test("a deployment with no keys is not reported as no devices", async ({ page }) => {
    await withSubscription(ENDPOINT)(page)
    await seedCache(page, [signedIn])
    await stubRpc(page, { sendTest: { sent: 0, gone: 0, failed: 0, configured: false } })

    await page.goto("/#/devices")
    await page.getByTestId("push-test").click()

    await expect(page.getByTestId("push-test-result")).toContainText(/push keys/i)
  })

  test("this browser is named as such in the device list", async ({ page }) => {
    /**
     * The production function, not a copy of it.
     *
     * The Worker hashes the endpoint with this and the page hashes its own
     * subscription with the same module; a reimplementation here would pass
     * while the two halves disagreed, which is the only way this feature can
     * break. Running it in Node also proves it works off a secure context —
     * `page.evaluate` on about:blank has no `crypto.subtle` at all, which is
     * how the first version of this test failed.
     */
    const id = await deviceFingerprint(ENDPOINT)

    await withSubscription(ENDPOINT)(page)
    await seedCache(page, [signedIn])
    await stubRpc(page, { devices: { devices: [{ label: "Safari on Mac", enabled: true, id }] } })

    await page.goto("/#/devices")
    await expect(page.getByTestId("device-0-here")).toBeVisible()
    await expect(page.getByTestId("device-not-registered")).toHaveCount(0)
  })

  test("a browser missing from the list is told so, however switched-on it looks", async ({ page }) => {
    await withSubscription(ENDPOINT)(page)
    await seedCache(page, [signedIn])
    // Somebody else's device. This is the macOS case: the installed web app has
    // its own storage and its own subscription, so the row that exists belongs
    // to Safari and the reader sitting in the app matches nothing.
    await stubRpc(page, {
      devices: { devices: [{ label: "Safari on Mac", enabled: true, id: "ffffffffffff" }] },
    })

    await page.goto("/#/devices")
    await expect(page.getByTestId("device-not-registered")).toBeVisible()
    await expect(page.getByTestId("device-0-here")).toHaveCount(0)
  })

  test("a tapped test notification says it arrived, which is the step nothing could show", async ({ page }) => {
    await withSubscription(ENDPOINT)(page)
    await seedCache(page, [signedIn])
    await stubRpc(page, {})

    /**
     * What the service worker navigates to on a tap. The route is the whole
     * point: the test notification used to open bare `#/profile`, the page the
     * button is on, so a working tap and a dead one rendered identically and
     * the reader's only possible report was "nothing happened".
     */
    await page.goto("/#/devices?pushtest=1756800000000")

    await expect(page.getByTestId("push-test-tapped")).toBeVisible()
    await page.getByTestId("push-test-tapped-clear").click()
    await expect(page.getByTestId("push-test-tapped")).toHaveCount(0)
  })

  test("a failed switch-on says so, instead of a button that does nothing", async ({ page }) => {
    // No subscription: this browser is in the state where the button reads
    // "Turn on notifications".
    await seedCache(page, [signedIn])
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        get: () => ({
          ready: Promise.resolve({
            pushManager: {
              getSubscription: async () => null,
              subscribe: async () => ({
                endpoint: "https://web.push.apple.com/NEW",
                toJSON: () => ({ endpoint: "https://web.push.apple.com/NEW", keys: { p256dh: "a", auth: "b" } }),
                unsubscribe: async () => true,
              }),
            },
          }),
          addEventListener() {},
          controller: null,
        }),
      })
      Object.defineProperty(Notification, "permission", { configurable: true, get: () => "granted" })
      Notification.requestPermission = async () => "granted" as NotificationPermission
    })
    // Registering the subscription is `authed`, and this is the throw that used
    // to leave `toggle()` rejecting with nothing rendered.
    await stubRpc(page, { subscribeStatus: 401 })

    await page.goto("/#/devices")
    await page.getByTestId("push-toggle").click()

    const err = page.getByTestId("push-toggle-error")
    await expect(err).toBeVisible()
    // The step, not a guess. This is the register half — the subscription was
    // made and the server refused it — and saying "signed out" for the OTHER
    // half sent a signed-in reader to check the one thing that was fine.
    await expect(err).toContainText(/could not be registered/i)
  })

  test("no session means no toggle either, since registering a browser is authed", async ({ page }) => {
    // A browser with no subscription and nobody signed in: the state the
    // toggle used to be offered in, where it could only ever return 401.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        get: () => ({
          ready: Promise.resolve({ pushManager: { getSubscription: async () => null } }),
          addEventListener() {},
          controller: null,
        }),
      })
    })
    await seedCache(page, [signedOut])
    await stubRpc(page, {})
    await page.goto("/#/devices")

    await expect(page.getByTestId("push-signed-out")).toBeVisible()
    await expect(page.getByTestId("push-toggle")).toHaveCount(0)
  })

  test("a browser that refuses to subscribe is not blamed on the session", async ({ page }) => {
    await seedCache(page, [signedIn])
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        get: () => ({
          ready: Promise.resolve({
            pushManager: {
              getSubscription: async () => null,
              // Safari's actual shape when it will not subscribe: a bare
              // AbortError carrying nothing useful.
              subscribe: async () => { throw new DOMException("failed", "AbortError") },
            },
          }),
          addEventListener() {},
          controller: null,
        }),
      })
      Object.defineProperty(Notification, "permission", { configurable: true, get: () => "granted" })
      Notification.requestPermission = async () => "granted" as NotificationPermission
    })
    await stubRpc(page, {})

    await page.goto("/#/devices")
    await page.getByTestId("push-toggle").click()

    const err = page.getByTestId("push-toggle-error")
    await expect(err).toBeVisible()
    await expect(err).toContainText(/refused to create/i)
    await expect(err).not.toContainText(/signed out/i)
  })
})
