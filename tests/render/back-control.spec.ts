import { test, expect } from "./fixture"
import { sessionFor } from "../helpers/actors"
import { projectOrg } from "../helpers/projections"
import { visit } from "../helpers/surfaces"
import { seedCache, entry, orpc } from "../helpers/seed-cache"

/**
 * There is a way back on a surface that has no browser Back.
 *
 * Installing removes the browser's chrome. Android supplies a system Back; iOS
 * offers only an undiscoverable edge swipe; the Tauri window — 1280px wide, on
 * Mac and Windows — offers nothing at all. So on most of the surfaces this
 * product ships to, the application is the only thing that can provide a way
 * out, and it provided none: the crumbs fold away below `sm`, and the return
 * trail lived only as a URL parameter that a few pages read.
 *
 * These assert the two halves that no device test can cover cheaply — that the
 * control is there, and that it goes where the reader came from rather than
 * where the hierarchy says. The installed surfaces themselves are a person on
 * real hardware; see the plan's acceptance table.
 *
 * docs/done/2026-09-09-10-installed-app-back-navigation.md.
 */

const ORG = projectOrg("org_001", ["ORG_ADMIN"])
const signedIn = sessionFor("COACH")

test.describe("The way back", () => {
  test("is offered at phone width, where the crumbs are not", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await seedCache(page, [signedIn, entry(orpc.orgs.list, undefined, { orgs: [ORG] })])
    await visit(page, "orgs")

    await expect(page.getByTestId("orgs-page")).toBeVisible()
    // The control, at the width where the ancestors are folded away. This is
    // the case an installed iPhone has and nothing else covers.
    await expect(page.getByTestId("back")).toBeVisible()
    await expect(page.getByTestId("back")).toHaveAttribute("aria-label", /.+/)
  })

  test("is offered at desktop width too, because a Tauri window has no chrome", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await seedCache(page, [signedIn, entry(orpc.orgs.list, undefined, { orgs: [ORG] })])
    await visit(page, "orgs")

    // Gating this on screen size would leave the desktop app — which has no
    // browser Back and no system Back — with no way out on a large screen.
    await expect(page.getByTestId("back")).toBeVisible()
  })

  test("returns to where the reader came from, not to the hierarchy", async ({ page }) => {
    await seedCache(page, [signedIn, entry(orpc.orgs.list, undefined, { orgs: [ORG] })])
    // Reached from Discover rather than from the directory. A hierarchy-only
    // control would send them to Orgs; the trail says Discover.
    await visit(page, "orgs", { query: { from: "/discover" } })

    // Exactly Discover, not "home or Discover": a regex that accepts the
    // fallback as well as the trail would pass with the trail ignored.
    await expect(page.getByTestId("back")).toHaveAttribute("href", "#/discover")
  })

  test("falls back to the page's parent when nothing carried a trail", async ({ page }) => {
    await seedCache(page, [signedIn, entry(orpc.orgs.list, undefined, { orgs: [ORG] })])
    // A cold link, a bookmark, a notification: no `from` at all. Orgs' parent
    // is home, and the control must still be there.
    await visit(page, "orgs")

    await expect(page.getByTestId("back")).toBeVisible()
    await expect(page.getByTestId("back")).toHaveAttribute("href", /#\/(\?|$)/)
  })
})

/**
 * The way out is there when the page has nothing to show.
 *
 * A reader on a missing record is the one who most needs an exit, and until now
 * three pages hand-rolled their own: a bare `<a>` with the arrow inside the
 * translated string, and `team.tsx` pointing at Discover although a team's
 * parent is Teams. The shell's control replaces all three and derives the
 * destination from the route, so it cannot point at the wrong parent.
 */
test.describe("When the record is missing", () => {
  test("the shell still offers the way out, at the right parent", async ({ page }) => {
    await seedCache(page, [signedIn])
    // Nothing seeded for this id: the harness 404s it, which is the missing
    // record a reader meets.
    await visit(page, "team", { id: "team_nope" })

    await expect(page.getByTestId("not-found")).toBeVisible()
    await expect(page.getByTestId("back")).toBeVisible()
    // Teams, not Discover — the defect the hand-rolled link carried.
    await expect(page.getByTestId("back")).toHaveAttribute("href", "#/teams")
  })
})

/**
 * The hierarchy is reachable on a phone, rather than removed.
 *
 * The ancestors were `hidden sm:inline-flex` — gone below 640px, which is the
 * width this product is mostly read at. The registry's `breadcrumb-responsive`
 * collapses instead of hiding, and this asserts the collapse exists and opens.
 *
 * Distinct from the Back control above: this is *where a thing lives*, that is
 * *where the reader came from*. A team reached from a schedule has Teams in its
 * hierarchy and the schedule in its trail, and both are worth having.
 */
test.describe("Hierarchy on a phone", () => {
  test("collapses behind an ellipsis instead of disappearing", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    // The org itself, not just the directory: the trail only renders once the
    // page has registered a title, and an unseeded page never gets that far.
    await seedCache(page, [signedIn, entry(orpc.orgs.get, { id: "org_001" }, ORG)])
    await visit(page, "org", { id: "org_001", query: { from: "/orgs" } })

    const overflow = page.getByTestId("crumb-overflow")
    await expect(overflow).toBeVisible()
    await overflow.click()
    // The ancestor is in the menu, so it is reachable rather than merely absent.
    await expect(page.getByRole("menu").getByRole("link")).toHaveCount(1)
  })

  test("stays inline at desktop width, where it fits", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await seedCache(page, [signedIn, entry(orpc.orgs.get, { id: "org_001" }, ORG)])
    await visit(page, "org", { id: "org_001", query: { from: "/orgs" } })

    // The trigger is `sm:hidden`; above that the row lays out as it always has.
    await expect(page.getByTestId("crumb-overflow")).toBeHidden()
  })
})
