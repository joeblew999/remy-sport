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
 *
 * ── The shell note, updated ──
 *
 * The shell is no longer `.app` as a viewport-height grid: it is the registry
 * Sidebar's provider (`main.tsx` adds `h-svh`), and `.page` is still the only
 * thing that scrolls. The topbar has its own check now, in
 * "the topbar stays one row" below — the original reason this file exists.
 */
import { test, expect } from "./fixture"
import { visit } from "../helpers/surfaces"
import { seedCache, entry, orpc } from "../helpers/seed-cache"
import { projectEvent } from "../helpers/projections"
import { sessionFor, VISITOR, type Role } from "../helpers/actors"

/** iPhone SE, iPhone 15/16, iPhone 16 Pro, Pro Max. The narrow one matters most. */
const WIDTHS = [360, 390, 402, 430]

/** The league. Its real name is the longest of the four, which is the point. */
const event = projectEvent("evt_002")

/**
 * Anything wider than the viewport that neither clips nor scrolls, reported
 * outermost-first so the answer is the container at fault rather than every
 * child inside it.
 */
async function offenders(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const scroller = document.querySelector("[data-testid=page]") ?? document.body
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
      await seedCache(page, [entry(orpc.events.list, undefined, { events: [event] })])

      const failures: string[] = []
      for (const route of ROUTES) {
        await page.goto(`/#${route}`) // check-ignore: iterates ROUTES — every route must fit
        await page.waitForFunction(() => !!document.querySelector("[data-testid=page]"))
        // The view swaps on hash change; give React a frame to commit it.
        await page.waitForTimeout(250)

        const over = await page.evaluate(() => {
          const p = document.querySelector("[data-testid=page]")!
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
    // The counterpart assertion: this must not be "fixed" by making the tab
    // strips shrink. The registry's tab lists (Discover's status tabs, the
    // event page's tabs) scroll their own content sideways on purpose, and the
    // check above passes them deliberately rather than by accident.
    await page.setViewportSize({ width: 390, height: 844 })
    await seedCache(page, [entry(orpc.events.list, undefined, { events: [event] })])
    await visit(page, "discover")

    const strips = await page.evaluate(() => {
      const limit = document.querySelector("[data-testid=page]")!.clientWidth + 1
      return [...document.querySelectorAll<HTMLElement>("[data-slot=tabs-list]")].map((el) => ({
        overflowX: getComputedStyle(el).overflowX,
        fitsParent: el.getBoundingClientRect().width <= limit,
      }))
    })
    expect(strips.length, "Discover has a tab strip").toBeGreaterThan(0)
    for (const strip of strips) {
      expect(strip.overflowX, "the tab strip scrolls its own content").toBe("auto")
      expect(strip.fitsParent, "and does not push its parent wider").toBe(true)
    }
  })

  test("the shell cannot be panned by a reader", async ({ page }) => {
    // `.page` has `overflow-y: auto`, and CSS computes `overflow-x: visible` to
    // `auto` beside it — which is what let a too-wide child slide the whole
    // content area under a topbar that stayed put. `overflow-x: clip` is the
    // floor that makes that impossible; this pins it.
    await page.setViewportSize({ width: 390, height: 844 })
    await seedCache(page, [entry(orpc.events.list, undefined, { events: [event] })])
    await visit(page, "discover")
    const overflowX = await page.evaluate(
      () => getComputedStyle(document.querySelector("[data-testid=page]")!).overflowX,
    )
    // `clip` computes to `hidden` when the other axis is not visible. Either
    // value means a reader cannot drag the shell sideways; `visible` or `auto`
    // means they can.
    expect(["clip", "hidden"]).toContain(overflowX)
  })
})

test.describe("the topbar stays one row", () => {
  /**
   * The mobile plan's step-1 check, and the B2 step-8 proof for the shell.
   *
   * The defect it exists for was found by eye, never by a check: for an admin
   * at 390px the topbar's second row read "Install app · Admin · Devices ·
   * Sign o" — Sign out was off the screen, and `tests/render/mobile-layout.spec.ts`
   * measured `.page` only, so nothing saw it. The chrome that wraps is the
   * shape of the bug; these assertions hold the shape, whatever the chrome
   * contains.
   *
   * 320 and 390 are the plan's widths — the narrowest device that matters and
   * the common one. Every role, and nobody: the visitor's topbar is the one
   * with Sign in, an admin's is the widest, and the rest sit between.
   */
  const ROLES: Array<[name: string, session: unknown]> = [
    ["visitor", VISITOR],
    ...(["ADMIN", "ORGANIZER", "COACH", "PLAYER", "REFEREE", "SPECTATOR"] as Role[]).map(
      (role) => [role.toLowerCase(), sessionFor(role)] as [string, unknown],
    ),
  ]

  for (const width of [320, 390]) {
    for (const [name, session] of ROLES) {
      test(`${name} at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 })
        await seedCache(page, [session as never, entry(orpc.events.list, undefined, { events: [event] })])
        await visit(page, "discover")

        // Measure styled, not merely painted: in dev the stylesheet arrives as
        // a module, and under a full tier's parallel load a bare timeout races
        // it — an unstyled header is a tall block, which reads as a wrap that
        // is not there.
        await page.waitForFunction(() => {
          const bar = document.querySelector(".topbar")
          return bar !== null && getComputedStyle(bar).display === "flex"
        })
        // And with the webfonts in, not the fallback faces — the same reason
        // the screenshot spec waits for fonts. The row must fit either way;
        // the brand gives, so this is belt and braces for the measurement.
        await page.evaluate(() => document.fonts.ready)
        await page.waitForTimeout(250)

        const problems = await page.evaluate(() => {
          const topbar = document.querySelector<HTMLElement>(".topbar")!
          const issues: string[] = []
          const box = topbar.getBoundingClientRect()
          if (box.height > 64) {
            issues.push(`topbar is ${Math.round(box.height)}px tall — it has wrapped to two rows`)
          }
          if (topbar.scrollWidth > topbar.clientWidth + 1) {
            issues.push(`topbar content is ${topbar.scrollWidth}px wide in a ${topbar.clientWidth}px row`)
          }
          for (const el of topbar.querySelectorAll<HTMLElement>("button, a")) {
            const r = el.getBoundingClientRect()
            if (r.width === 0 && r.height === 0) continue
            if (r.right > window.innerWidth + 1 || r.left < -1) {
              const label = (el.getAttribute("aria-label") ?? el.textContent ?? el.tagName).trim()
              issues.push(`control "${label.slice(0, 24)}" sits outside the viewport`)
            }
          }
          return issues
        })
        expect(problems, "the topbar is one row with every control inside the viewport").toEqual([])
      })
    }
  }
})

test.describe("no screen overflows on a narrow desktop", () => {
  // The content column is the viewport minus the 220px sidebar and gutters.
  // Below ~1300px the Discover toolbar (tabs + filter chips) no longer fits on
  // one row, and below ~900px the seven-column event rows no longer fit. Both
  // used to push `.page` sideways — the same panning bug the phone test
  // catches, but in the 769–1280px band that no phone width reaches.
  const WIDTHS = [769, 850, 900, 1000, 1100, 1200, 1280]

  for (const width of WIDTHS) {
    test(`discover fits at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await seedCache(page, [entry(orpc.events.list, undefined, { events: [event] })])
      await visit(page, "discover")

      const over = await page.evaluate(() => {
        const p = document.querySelector("[data-testid=page]")!
        return p.scrollWidth - p.clientWidth
      })
      expect(over, `discover overflows by ${over}px at ${width}px`).toBeLessThanOrEqual(1)
    })
  }
})
