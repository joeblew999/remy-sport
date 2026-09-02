import { test, expect } from "./fixture"

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
 *   - `.admin-card h2` is styled down to 13px uppercase; `h3` had no rule at
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
test.describe("The notification section, as a reader sees it", () => {
  test("a status line reads as a line, not as a page with nothing on it", async ({ page }) => {
    await page.goto("/#/profile")

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
    await page.goto("/#/profile")

    const section = page.getByTestId("notification-settings")
    const size = (sel: string) =>
      section.locator(sel).first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize))

    const [h2, h3] = [await size("h2"), await size("h3")]
    expect(h3, `h3 (${h3}px) must not shout louder than h2 (${h2}px)`).toBeLessThanOrEqual(h2)
  })

  test("the preference list is a list of settings, not a bulleted list", async ({ page }) => {
    await page.goto("/#/profile")

    const list = page.getByTestId("notification-settings").locator("ul.pref-list").first()
    await expect(list).toBeVisible()

    const style = await list.evaluate((el) => {
      const s = getComputedStyle(el)
      return { marker: s.listStyleType, indent: parseFloat(s.paddingLeft) }
    })
    expect(style.marker, "browser bullets in a settings card").toBe("none")
    expect(style.indent, "the browser's 40px list indent").toBeLessThan(8)
  })
})
