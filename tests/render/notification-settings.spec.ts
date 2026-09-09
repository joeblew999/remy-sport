import { test, expect } from "./fixture"
import { as } from "../helpers/actors"
import { visit } from "../helpers/surfaces"

/**
 * How the notification section READS, which nothing checked.
 *
 * Its logic was well covered — no-backend.spec.ts holds the promise contract and
 * `check:notifications` holds the type list against what the Worker sends. What
 * nothing held was whether any of it was legible, and it was not: three defects
 * that a person saw immediately and no test could.
 *
 *   - Every one-sentence push status rendered through `.empty`, which is a
 *     whole-screen empty state — 60px of padding and a dashed border. Five of
 *     them on one page, each a large dashed rectangle around a single line.
 *   - `.panel h2` is styled down to 13px uppercase; `h3` had no rule at
 *     all, so the three sub-headings came out at the browser default — larger
 *     and blacker than the section title above them.
 *   - `.pref-list` had no rule either, so all three lists carried browser
 *     bullets and a 40px indent in a card where nothing else had either.
 *
 * These assert relationships rather than exact values — that a heading is
 * smaller than the one above it, that a status line is not page-sized — because
 * pinning 12px would fail on every legitimate restyle and teach people to edit
 * the test until it passed.
 *
 * No backend, which is the point: with no server the section renders its
 * "could not find out" status, and that status is one of the five that used to
 * be a dashed rectangle.
 */
/** Resolved and empty — see push-settings.spec.ts on why absent is not enough. */
test.describe("The notification section, as a reader sees it", () => {
  test("a status line reads as a line, not as a page with nothing on it", async ({ page }) => {
    await as(page, "ADMIN")
    await visit(page, "notifications")

    const note = page.getByTestId("push-unknown")
    await expect(note).toBeVisible()

    const box = await note.boundingBox()
    // `.empty` is 60px of padding on every side, so it cannot be under ~130px
    // tall. A sentence with room to breathe is well under that.
    expect(box!.height, "a one-line status should not be page-sized").toBeLessThan(120)

    const pad = await note.evaluate((el) => parseFloat(getComputedStyle(el).paddingTop))
    expect(pad, "60px of padding belongs to a whole-screen empty state").toBeLessThan(24)
  })

  test("sub-headings sit below the section title, not above it", async ({ page }) => {
    await as(page, "ADMIN")
    await visit(page, "notifications")

    const size = (locator: ReturnType<typeof page.locator>) =>
      locator.first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize))

    /**
     * The title is the page header's h1 since the settings became their own
     * page: the card carried its own title while it was one section of
     * /#/devices, and printing "Notifications" immediately under the page
     * heading of the same name was the reason to drop it.
     *
     * The relationship is what matters and it is unchanged — a sub-heading must
     * not shout louder than the heading above it.
     */
    const [title, h3] = [
      await size(page.locator("h1")),
      await size(page.getByTestId("notification-settings").locator("h3")),
    ]
    expect(h3, `h3 (${h3}px) must not shout louder than the page title (${title}px)`).toBeLessThanOrEqual(title)
  })

  test("the preference list is a list of settings, not a bulleted list", async ({ page }) => {
    await as(page, "ADMIN")
    await visit(page, "notifications")

    // The registry's ItemGroup: a list by role, with no browser bullets and no
    // 40px indent, which is what the old `<ul>` had to be styled out of.
    const list = page
      .getByTestId("notification-settings")
      .locator("[data-slot=item-group]")
      .filter({ has: page.getByTestId("pref-MATCH_START") })
    await expect(list).toBeVisible()
    await expect(list).toHaveAttribute("role", "list")
    const indent = await list.evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft))
    expect(indent, "the browser's 40px list indent").toBeLessThan(8)
  })

  /**
   * Where it lives, and why that is a test rather than a preference.
   *
   * There are two device lists and both say "this device": the sessions on
   * /#/devices (where you are signed in) and the push subscriptions here (where
   * notifications are delivered). They are not the same thing and they
   * genuinely diverge — a Mac held a push subscription for an account it was
   * signed out of while a signed-in iPhone had none.
   *
   * They shared one page until 2026-09-09 precisely so that difference was
   * visible. Email ended that: an address is not a device, so the settings
   * outgrew a page named for devices and moved to /#/notifications.
   *
   * What adjacency did, the pages must now say. So this holds the replacement,
   * not merely the separation: each list is on its own page, neither is back on
   * the dashboard, and each page names the other list and links to it. A test
   * that only asserted "they are apart" would protect nothing.
   */
  test("is its own page, and names the list it is not", async ({ page }) => {
    await as(page, "ADMIN")
    await visit(page, "dashboard")
    await expect(
      page.getByTestId("notification-settings"),
      "settings on a dashboard is how the two device lists ended up apart",
    ).toHaveCount(0)

    await visit(page, "notifications")
    await expect(page.getByTestId("notification-settings")).toBeVisible()
    // Sessions are not here, and this page says where they are.
    await expect(page.getByTestId("devices-list")).toHaveCount(0) // check-ignore: asserts absence
    await expect(page.getByTestId("to-devices")).toBeVisible()

    // And the other way: sessions, without the settings, pointing back. The
    // page rather than its list — what the session rows say is
    // devices.spec.ts's subject, and it seeds the cache to ask.
    await visit(page, "sessions")
    await expect(page.getByTestId("devices-page")).toBeVisible()
    await expect(page.getByTestId("notification-settings")).toHaveCount(0) // check-ignore: asserts absence
    await expect(page.getByTestId("to-notifications")).toBeVisible()
  })

  test("puts the devices before the preferences, because a device is the prerequisite", async ({ page }) => {
    await as(page, "ADMIN")
    await visit(page, "notifications")

    /**
     * Order as the reader meets it: this device, then which devices, then what
     * to hear about. Choosing types is refinement — with nothing registered it
     * is moot, and it used to render first, fully enabled-looking, above the
     * list that would have said so. On a phone that put a full screen of scroll
     * between "On for this device" and the row marked "· this device".
     */
    const headings = await page
      .getByTestId("notification-settings")
      .locator("h3")
      .allInnerTexts()
    const devices = headings.findIndex((h) => /device/i.test(h))
    const prefs = headings.findIndex((h) => /hear/i.test(h))
    expect(devices, "a devices heading").toBeGreaterThanOrEqual(0)
    expect(prefs, "a preferences heading").toBeGreaterThanOrEqual(0)
    expect(devices, `devices (${devices}) must precede preferences (${prefs})`).toBeLessThan(prefs)
  })

  test("says the device state once, not twice", async ({ page }) => {
    await as(page, "ADMIN")
    await visit(page, "notifications")
    // "On for this device" sat under a button already reading "Turn off on this
    // device" — the verb after the fact it was derived from, and one more thing
    // that could disagree with the list below.
    // Named in order to assert it is GONE: the status line that duplicated the
    // button above it.
    await expect(page.getByTestId("push-on-here")).toHaveCount(0) // check-ignore: asserts absence
  })

  test("does not carry the follow list, which is content rather than a device setting", async ({ page }) => {
    await as(page, "ADMIN")
    await visit(page, "notifications")
    // "Kanya Thongdee · Player" under two browsers and a row of checkboxes, in
    // a section about where push is delivered.
    await expect(
      page.getByTestId("notification-settings").getByTestId("following-list"),
    ).toHaveCount(0)

    await visit(page, "dashboard")
    await expect(page.getByTestId("following-card")).toBeVisible()
  })

  /**
   * The install prompt stays out of the way of every spec in this tier.
   *
   * `<pwa-install>` is a fixed overlay and a bottom sheet on a phone, so it sits
   * on top of whatever a test is looking at — it covered the device list in
   * every screenshot taken while this section was being reworked, and anything
   * clicking near the bottom of a page is one layout change from hitting it.
   *
   * ./fixture.ts suppresses it the way the component itself does, via the
   * `pwa-hide-install` flag it reads in its constructor, rather than by hiding
   * it in CSS. This asserts the suppression still works, because a silent
   * failure of it looks like a flaky click somewhere unrelated.
   *
   * Visibility, not height: it is hidden by opacity and transform, so the card
   * keeps its 190px whether shown or not — which is exactly how the first
   * version of this check fooled me into thinking the fixture had not worked.
   */
  test("the install prompt is not covering anything in this tier", async ({ page }) => {
    await as(page, "ADMIN")
    await visit(page, "notifications")
    await page.waitForTimeout(600)

    const seen = await page.evaluate(() => {
      const card = document
        .querySelector("pwa-install")
        ?.shadowRoot?.querySelector("article.install-dialog") as HTMLElement | null
      if (!card) return false
      const s = getComputedStyle(card)
      const r = card.getBoundingClientRect()
      const onScreen = r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth
      return onScreen && s.opacity !== "0" && s.visibility !== "hidden"
    })
    expect(seen, "an overlay over the page makes every other assertion suspect").toBe(false)
  })
})
