import { test, expect } from "./fixture"
import { as } from "../helpers/actors"
import { deviceFingerprint } from "../../src/domain/device-fingerprint"
import { visit } from "../helpers/surfaces"
import { ENDPOINT, stubPushRpc, withNotificationPermission, withSubscription } from "../helpers/push"

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

test.describe("Push settings, with a subscription this browser actually holds", () => {
  test("a refused send says so, instead of rendering nothing", async ({ page }) => {
    await withSubscription(page)
    await as(page, "ADMIN")
    await stubPushRpc(page, { sendTestStatus: 401 })

    await visit(page, "notifications")
    await page.getByTestId("push-test").click()

    // The whole bug: this used to be a click with no consequence on screen.
    await expect(page.getByTestId("push-test-error")).toBeVisible()
  })


  test("a send the push service refused is not reported as success", async ({ page }) => {
    await withSubscription(page)
    await as(page, "ADMIN")
    await stubPushRpc(page, { sendTest: { sent: 0, gone: 0, failed: 1, configured: true } })

    await visit(page, "notifications")
    await page.getByTestId("push-test").click()

    const result = page.getByTestId("push-test-result")
    await expect(result).toBeVisible()
    // `failed` used to be discarded before it reached here, and this read
    // "Sent to 0 device(s)" — the same sentence as having no devices at all.
    await expect(result).toContainText(/refused/i)
  })

  test("a deployment with no keys is not reported as no devices", async ({ page }) => {
    await withSubscription(page)
    await as(page, "ADMIN")
    await stubPushRpc(page, { sendTest: { sent: 0, gone: 0, failed: 0, configured: false } })

    await visit(page, "notifications")
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

    await withSubscription(page)
    await as(page, "ADMIN")
    await stubPushRpc(page, { devices: { devices: [{ label: "Safari on Mac", enabled: true, id }] } })

    await visit(page, "notifications")
    await expect(page.getByTestId("device-0-here")).toBeVisible()
    await expect(page.getByTestId("device-not-registered")).toHaveCount(0)
  })

  test("a browser missing from the list is told so, however switched-on it looks", async ({ page }) => {
    await withSubscription(page)
    await as(page, "ADMIN")
    // Somebody else's device. This is the macOS case: the installed web app has
    // its own storage and its own subscription, so the row that exists belongs
    // to Safari and the reader sitting in the app matches nothing.
    await stubPushRpc(page, {
      devices: { devices: [{ label: "Safari on Mac", enabled: true, id: "ffffffffffff" }] },
    })

    await visit(page, "notifications")
    await expect(page.getByTestId("device-not-registered")).toBeVisible()
    await expect(page.getByTestId("device-0-here")).toHaveCount(0)
  })

  test("a tapped test notification says it arrived, which is the step nothing could show", async ({ page }) => {
    await withSubscription(page)
    await as(page, "ADMIN")
    await stubPushRpc(page, {})

    /**
     * What the service worker navigates to on a tap. The route is the whole
     * point: the test notification used to open bare `#/profile`, the page the
     * button is on, so a working tap and a dead one rendered identically and
     * the reader's only possible report was "nothing happened".
     */
    await visit(page, "notifications", { query: { pushtest: "1756800000000" } })

    await expect(page.getByTestId("push-test-tapped")).toBeVisible()
    await page.getByTestId("push-test-tapped-clear").click()
    await expect(page.getByTestId("push-test-tapped")).toHaveCount(0)
  })

  test("a failed switch-on says so, instead of a button that does nothing", async ({ page }) => {
    // No subscription: this browser is in the state where the button reads
    // "Turn on notifications".
    await as(page, "ADMIN")
    await withSubscription(page, null)
    await withNotificationPermission(page)
    // Registering the subscription is `authed`, and this is the throw that used
    // to leave `toggle()` rejecting with nothing rendered.
    await stubPushRpc(page, { subscribeStatus: 401 })

    await visit(page, "notifications")
    await page.getByTestId("push-toggle").click()

    const err = page.getByTestId("push-toggle-error")
    await expect(err).toBeVisible()
    // The step, not a guess. This is the register half — the subscription was
    // made and the server refused it — and saying "signed out" for the OTHER
    // half sent a signed-in reader to check the one thing that was fine.
    await expect(err).toContainText(/could not be registered/i)
  })


  test("a browser that refuses to subscribe is not blamed on the session", async ({ page }) => {
    await as(page, "ADMIN")
    await withSubscription(page, null, { subscribeRefuses: true })
    await withNotificationPermission(page)
    await stubPushRpc(page, {})

    await visit(page, "notifications")
    await page.getByTestId("push-toggle").click()

    const err = page.getByTestId("push-toggle-error")
    await expect(err).toBeVisible()
    await expect(err).toContainText(/refused to create/i)
    await expect(err).not.toContainText(/signed out/i)
  })
})
