/**
 * Where each thing lives, in one place, so moving it is one edit.
 *
 * Twenty of twenty-three render specs hardcoded `page.goto("/#/profile")`. That
 * is not a route, it is an assumption about layout repeated in twenty files —
 * and moving the notification settings from the profile to /#/devices meant
 * editing fifteen navigations across three of them, with the tier red in
 * between. The tests were coupled to the information architecture, so every
 * change to the architecture was a change to the tests.
 *
 * A surface is a thing a reader can look at. `open(page, "notifications")` says
 * what the test is about; the route it currently lives on is this file's
 * business and nobody else's.
 *
 * ## Why not derive this from the router
 *
 * `ROUTES` in src/web/lib/router.tsx lists routes, which is a different
 * question. A surface can move between routes without either list changing
 * length, and two surfaces can share one route — `following` and `my-events`
 * are both on the profile today. Deriving one from the other would tie a test's
 * vocabulary to a page's, which is the coupling this is here to remove.
 */
import type { Page } from "@playwright/test"

/**
 * The map. Adding a surface is a line; moving one is a line changed.
 *
 * Keep the names about what a reader sees rather than which component renders
 * it — a component can be split or renamed without the surface moving, and a
 * test that says "notifications" survives both.
 */
export const SURFACES = {
  /** Push: this device, the devices receiving them, and what they are for. */
  notifications: "/#/devices",
  /** Where you are signed in. Sessions, not subscriptions — a different list. */
  sessions: "/#/devices",
  /** What this reader follows: teams, events, players. */
  following: "/#/profile",
  /** The reader's own dashboard — invitations, their children, their events. */
  dashboard: "/#/profile",
  /** Everything on, a list to browse. */
  discover: "/",
  /** Signing in. */
  login: "/#/login",
} as const

export type Surface = keyof typeof SURFACES

/**
 * Open the page a surface is on, optionally with query parameters.
 *
 * `query` is part of this rather than something a caller appends, because
 * routing here is hash-based: navigating to the surface and THEN to the same
 * route with a query is a hash-only change, which is a same-document
 * navigation — the second `goto` does not reload and the parameters never
 * reach the app. That is not hypothetical; it is how the tap-confirmation test
 * broke the moment it was moved onto this helper.
 *
 * Returns the URL it opened, so a spec that genuinely needs one — a deep-link
 * assertion, say — can have it without hardcoding a route.
 */
export async function open(
  page: Page,
  surface: Surface,
  query?: Record<string, string>,
): Promise<string> {
  const route = SURFACES[surface]
  const url = query ? `${route}?${new URLSearchParams(query).toString()}` : route
  await page.goto(url)
  return url
}
