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
const SURFACES = {
  /** Everything on, the list a visitor lands on. */
  discover: () => "/",
  /** The reader's own dashboard — invitations, their children, their events. */
  dashboard: () => "/#/profile",
  /** What this reader follows: teams, events, players. On the dashboard today. */
  following: () => "/#/profile",
  /** Push: this device, the devices receiving them, and what they are for. */
  notifications: () => "/#/devices",
  /** Where you are signed in. Sessions, not subscriptions — a different list. */
  sessions: () => "/#/devices",
  /** Signing in. */
  login: () => "/#/login",
  /** Platform administration. */
  admin: () => "/#/admin",
  /** Games in progress. */
  live: () => "/#/live",
  /** The events this reader organises. */
  myEvents: () => "/#/events",
  /** Schools and clubs. */
  orgs: () => "/#/orgs",
  org: (id?: string) => `/#/org/${id}`,
  event: (id?: string) => `/#/event/${id}`,
  team: (id?: string) => `/#/team/${id}`,
  broadcast: (id?: string) => (id ? `/#/broadcast/${id}` : "/#/broadcast"),
  watch: (id?: string) => `/#/watch/${id}`,
} as const

export type Surface = keyof typeof SURFACES

interface OpenOptions {
  /** Whatever identifies this one — an event id, a team id. */
  id?: string
  /**
   * Query parameters, applied here rather than appended by a caller.
   *
   * Routing is hash-based, so opening a surface and THEN navigating to the same
   * route with a query is a hash-only change — a same-document navigation, no
   * reload, and the parameters never reach the app. That broke the
   * tap-confirmation test the moment it moved onto this helper.
   */
  query?: Record<string, string>
}

/** The URL for a surface, without navigating. For deep-link assertions. */
export function urlFor(surface: Surface, opts: OpenOptions = {}): string {
  const route = SURFACES[surface](opts.id)
  if (!opts.query) return route

  /**
   * Inside the hash, not after the origin.
   *
   * Routing here is hash-based, so `/?province=CMI` and `/#/?province=CMI` are
   * different URLs and only the second is one the router can read — the first
   * puts the query where the server would look and the app never sees it.
   * `discover` is "/" with no hash at all, so one has to be added.
   *
   * Getting this wrong is silent: the page loads, renders its unfiltered
   * default, and the assertion fails somewhere that looks like a filtering bug.
   */
  const search = new URLSearchParams(opts.query).toString()
  const [path, hash] = route.split("#")
  return hash ? `${path}#${hash}?${search}` : `${path}#/?${search}`
}

/**
 * Go to the page a surface is on. Returns the URL it opened.
 *
 * `visit`, not `open`: two specs already define a local `open` for their own
 * disclosure widgets, and a helper that collides with the thing it is meant to
 * replace gets aliased into inconsistency.
 */
export async function visit(page: Page, surface: Surface, opts: OpenOptions = {}): Promise<string> {
  const url = urlFor(surface, opts)
  await page.goto(url)
  return url
}
