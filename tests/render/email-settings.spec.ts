import { test, expect } from "./fixture"
import { as } from "../helpers/actors"
import { visit } from "../helpers/surfaces"
import { stubPushRpc } from "../helpers/push"

/**
 * The email switches on the notification settings, in every released locale,
 * light and dark — docs/2026-09-09-02-email-channel-on-react-email.md.
 *
 * Email is opt-in, so each switch starts off and says so; only a verified
 * address can turn one on, and the sentence above the list names the address
 * or says why it cannot be used. The server's answer is stubbed: this tier has
 * no Worker, and the branches under test are the page's own.
 */
const following = (email: { address: string; verified: boolean } | null, emailOn: string[] = []) => ({
  muted: [],
  following: [],
  emailOn,
  email,
})

for (const locale of ["en", "th", "ja"]) {
  for (const scheme of ["light", "dark"] as const) {
    test(`a verified address: switches usable, one on, the address named — ${locale}, ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await page.addInitScript((l) => localStorage.setItem("remy.locale", l), locale)
      await as(page, "SPECTATOR")
      await stubPushRpc(page, { following: following({ address: "pim.s@example.test", verified: true }, ["MATCH_START"]) })

      await visit(page, "notifications")
      // The address is a row in *Where notifications go* now, beside the
      // browsers it is a peer of — not a caption under *What to hear about*,
      // which asks a different question (docs/2026-09-09-08).
      await expect(page.getByTestId("email-channel-row")).toContainText("pim.s@example.test")
      const on = page.getByTestId("email-pref-MATCH_START")
      await expect(on).toBeEnabled()
      await expect(on).toHaveAttribute("aria-checked", "true")
      const off = page.getByTestId("email-pref-SCORE_UPDATE")
      await expect(off).toBeEnabled()
      await expect(off).toHaveAttribute("aria-checked", "false")
    })
  }
}

test("an unverified address keeps every email switch off, and says why", async ({ page }) => {
  await as(page, "SPECTATOR")
  await stubPushRpc(page, { following: following({ address: "pim.s@example.test", verified: false }) })

  await visit(page, "notifications")
  await expect(page.getByTestId("email-state")).toBeVisible()
  await expect(page.getByTestId("email-state")).not.toContainText("pim.s@example.test")
  // ROSTER_CHANGE has no cell at all now: there is no EMAIL renderer for it,
  // so it says "push only" instead of offering a switch that stores a
  // preference nothing reads. tests/repo/notifications.test.ts holds that.
  for (const code of ["MATCH_START", "SCORE_UPDATE", "MATCH_END", "EVENT_REMINDER"]) {
    await expect(page.getByTestId(`email-pref-${code}`)).toBeDisabled()
  }
  await expect(page.getByTestId("email-pref-ROSTER_CHANGE")).toHaveCount(0) // check-ignore: asserts absence
  await expect(page.getByTestId("email-none-ROSTER_CHANGE")).toBeVisible()
})

test("no registered address: the switches are off and the sentence says there is none", async ({ page }) => {
  await as(page, "SPECTATOR")
  await stubPushRpc(page, { following: following(null) })

  await visit(page, "notifications")
  await expect(page.getByTestId("email-state")).toBeVisible()
  await expect(page.getByTestId("email-pref-MATCH_START")).toBeDisabled()
})

test("turning a switch on sends the EMAIL channel, not the push one", async ({ page }) => {
  await as(page, "SPECTATOR")
  await stubPushRpc(page, { following: following({ address: "pim.s@example.test", verified: true }) })
  const sent = page.waitForRequest((r) => r.url().includes("notifications/setPreference") && r.method() === "POST")
  await page.route("**/rpc/notifications/setPreference**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ json: { ok: true } }) }),
  )

  await visit(page, "notifications")
  await page.getByTestId("email-pref-MATCH_END").click()
  const request = await sent
  expect(request.postDataJSON()).toMatchObject({ json: { notificationTypeCode: "MATCH_END", channelCode: "EMAIL", isEnabled: true } })
})
