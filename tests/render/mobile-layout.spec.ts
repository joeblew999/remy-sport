/**
 * No screen pans sideways on a phone.
 *
 * Every mobile bug found so far has been the same shape: a `display: grid` or
 * `display: flex` written for the desktop, with no `@media (max-width: 768px)`
 * rule at all. `.admin-table` had none. `.standing-row` had only a font-size
 * change. `.live-banner` had nothing, and its five columns with 32px gaps came
 * to 649px inside a 402px card.
 *
 * Each one was found by looking at a screenshot, one at a time, after it
 * shipped.
 *
 * ── Why `.page` and not the document ──
 *
 * `document.documentElement.scrollWidth` was 402 every single time, and that
 * measurement is what made me say "no overflow" for hours while the product was
 * visibly broken. The document does not scroll here because the app is a fixed
 * shell: `.app` is a viewport-height grid and `.page` is the only thing that
 * scrolls. `.page` has `overflow-y: auto`, and CSS computes `overflow-x` to
 * `auto` too when the other axis is not `visible` — so `.page` pans, silently,
 * while every document-level check passes.
 *
 * That is exactly what the reported bug looked like: content sliding under a
 * topbar that stayed still, because the topbar is outside `.page`.
 *
 * So this asserts the scroll container, and the document, and every element
 * that overflows without clipping. A strip that scrolls itself — the tab row,
 * the filter chips — is deliberate and passes: `overflow-x: auto` is the fix,
 * not the fault.
 */
import { test, expect } from "./fixture"
import { seedCache, entry, orpc } from "../helpers/seed-cache"

/** iPhone SE, iPhone 15/16, iPhone 16 Pro, Pro Max. The narrow one matters most. */
const WIDTHS = [360, 390, 402, 430]

const event = {
  id: "e1",
  name: "Bangkok Schools Basketball League 2026",
  names: { en: "Bangkok Schools Basketball League 2026" },
  typeCode: "league",
  formatCode: "5x5",
  startDate: "2026-05-01",
  endDate: "2026-05-30",
  cityCode: "BKK",
  provinceCode: "BKK",
  isFibaCertified: false,
  organizerName: "Niran Wongthai",
  description: null,
  timezone: "Asia/Bangkok",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as never

/**
 * Anything wider than the viewport that neither clips nor scrolls, reported
 * outermost-first so the answer is the container at fault rather than every
 * child inside it.
 */
async function offenders(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const scroller = document.querySelector(".page") ?? document.body
    const limit = scroller.clientWidth
    const found: string[] = []
    for (const el of scroller.querySelectorAll<HTMLElement>("*")) {
      const w = el.getBoundingClientRect().width
      if (w <= limit + 1 && el.scrollWidth <= limit + 1) continue
      const style = getComputedStyle(el)
      // A strip that scrolls itself is the intended treatment, not a bug.
      if (style.overflowX === "auto" || style.overflowX === "scroll") continue
      const parent = el.parentElement
      if (parent && parent !== scroller) {
        const pw = parent.getBoundingClientRect().width
        if (pw > limit + 1 || parent.scrollWidth > limit + 1) continue
      }
      const cls = String(el.className).split(" ").filter(Boolean).slice(0, 2).join(".")
      found.push(`${el.tagName.toLowerCase()}${cls ? "." + cls : ""} (${Math.round(w)}px wide, content ${el.scrollWidth}px)`)
    }
    return [...new Set(found)]
  })
}

/** How far the scroll container can actually be panned sideways. */
async function pan(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const el = document.querySelector(".page")
    if (!el) return { pannable: 0, docPannable: 0 }
    el.scrollLeft = 9999
    const pannable = el.scrollLeft
    el.scrollLeft = 0
    window.scrollTo(9999, 0)
    const docPannable = window.scrollX
    window.scrollTo(0, 0)
    return { pannable, docPannable }
  })
}

test.describe("no screen pans sideways on a phone", () => {
  for (const width of WIDTHS) {
    test(`discover at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 })
      await seedCache(page, [entry(orpc.events.list, undefined, { events: [event] } as never)])
      await page.goto("/#/")
      await expect(page.locator(".event-list")).toBeVisible()

      expect(await offenders(page), "elements wider than the viewport that neither clip nor scroll").toEqual([])
      const { pannable, docPannable } = await pan(page)
      expect(pannable, ".page must not scroll horizontally").toBe(0)
      expect(docPannable, "the document must not scroll horizontally").toBe(0)
    })
  }

  test("the strips that are meant to scroll still do", async ({ page }) => {
    // The counterpart assertion: this must not be "fixed" by making the tab row
    // wrap or shrink. It is a horizontally scrollable strip on purpose, and the
    // check above passes it deliberately rather than by accident.
    await page.setViewportSize({ width: 390, height: 844 })
    await seedCache(page, [entry(orpc.events.list, undefined, { events: [event] } as never)])
    await page.goto("/#/")

    const scrolls = await page.evaluate(() => {
      const el = document.querySelector(".tab-row")!
      return { inner: el.scrollWidth > el.clientWidth, fitsParent: el.getBoundingClientRect().width <= document.querySelector(".page")!.clientWidth + 1 }
    })
    expect(scrolls.inner, "the tab row scrolls its own content").toBe(true)
    expect(scrolls.fitsParent, "and does not push its parent wider").toBe(true)
  })
})
