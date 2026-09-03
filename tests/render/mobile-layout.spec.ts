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
import { visit } from "../helpers/surfaces"
import { seedCache, entry, orpc } from "../helpers/seed-cache"
import { apiEvent } from "../helpers/api-fixtures"

/** iPhone SE, iPhone 15/16, iPhone 16 Pro, Pro Max. The narrow one matters most. */
const WIDTHS = [360, 390, 402, 430]

const event = apiEvent({
  id: "e1",
  names: { en: "Bangkok Schools Basketball League 2026" },
  startDate: "2026-05-01",
  endDate: "2026-05-30",
  cityCode: "BANGKOK",
  provinceCode: "BKK",
  organizerName: "Niran Wongthai",
})

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


/**
 * Every route the SPA can render, at every phone width.
 *
 * `/live`, `/profile` and the event overview render from fixtures baked into
 * the bundle, so they need no seeding — which is why covering them costs a line
 * each rather than a block of setup. The two that read the API get the same
 * event the rest of this file uses.
 */
const ROUTES = [
  "/",
  "/orgs",
  "/org/org_001",
  "/event/evt_001",
  "/event/evt_002",
  "/team/team_001",
  "/live",
  "/profile",
  "/devices",
  "/login",
  "/admin",
]

test.describe("no screen overflows on a phone", () => {
  for (const width of WIDTHS) {
    test(`every route fits at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 })
      await seedCache(page, [entry(orpc.events.list, undefined, { events: [event], canCreate: false })])

      const failures: string[] = []
      for (const route of ROUTES) {
        await page.goto(`/#${route}`)
        await page.waitForFunction(() => !!document.querySelector(".page"))
        // The view swaps on hash change; give React a frame to commit it.
        await page.waitForTimeout(250)

        const over = await page.evaluate(() => {
          const p = document.querySelector(".page")!
          return p.scrollWidth - p.clientWidth
        })
        if (over > 1) {
          const worst = await offenders(page)
          failures.push(`${route} overflows by ${over}px — ${worst[0] ?? "cause not isolated"}`)
        }
      }
      expect(failures, "routes whose content is wider than the viewport").toEqual([])
    })
  }

  test("the strips that are meant to scroll still do", async ({ page }) => {
    // The counterpart assertion: this must not be "fixed" by making the tab row
    // wrap or shrink. It is a horizontally scrollable strip on purpose, and the
    // check above passes it deliberately rather than by accident.
    await page.setViewportSize({ width: 390, height: 844 })
    await seedCache(page, [entry(orpc.events.list, undefined, { events: [event], canCreate: false })])
    await visit(page, "discover")

    const scrolls = await page.evaluate(() => {
      const el = document.querySelector(".tab-row")!
      return {
        inner: el.scrollWidth > el.clientWidth,
        fitsParent: el.getBoundingClientRect().width <= document.querySelector(".page")!.clientWidth + 1,
      }
    })
    expect(scrolls.inner, "the tab row scrolls its own content").toBe(true)
    expect(scrolls.fitsParent, "and does not push its parent wider").toBe(true)
  })

  test("the shell cannot be panned by a reader", async ({ page }) => {
    // `.page` has `overflow-y: auto`, and CSS computes `overflow-x: visible` to
    // `auto` beside it — which is what let a too-wide child slide the whole
    // content area under a topbar that stayed put. `overflow-x: clip` is the
    // floor that makes that impossible; this pins it.
    await page.setViewportSize({ width: 390, height: 844 })
    await seedCache(page, [entry(orpc.events.list, undefined, { events: [event], canCreate: false })])
    await visit(page, "discover")
    const overflowX = await page.evaluate(
      () => getComputedStyle(document.querySelector(".page")!).overflowX,
    )
    // `clip` computes to `hidden` when the other axis is not visible. Either
    // value means a reader cannot drag the shell sideways; `visible` or `auto`
    // means they can.
    expect(["clip", "hidden"]).toContain(overflowX)
  })
})
