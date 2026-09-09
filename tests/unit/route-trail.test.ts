import { beforeEach, expect, test } from "vitest"
import { ancestorsOf, parseRoute, routeHref, __setHereForTest } from "../../src/web/lib/router"

/**
 * The route taken, carried in the URL.
 *
 * The Product Owner, 2026-09-09: a team reached from a schedule must go back to
 * that schedule, everywhere. A breadcrumb alone cannot do it — a team's position
 * in the hierarchy is Teams however you arrived — so the way in is recorded as
 * `from`, and these are the three things that have to hold for it to be a way
 * back rather than a loop.
 */
beforeEach(() => __setHereForTest(null))

test("a drill-in link records where it was clicked from", () => {
  __setHereForTest(parseRoute("#/event/evt_002?tab=teams"))
  expect(routeHref({ page: "team", id: "team_001" }))
    .toBe("#/team/team_001?from=%2Fevent%2Fevt_002%3Ftab%3Dteams")
})

test("a nav link to a top-level page records nothing", () => {
  __setHereForTest(parseRoute("#/event/evt_002"))
  expect(routeHref({ page: "teams" })).toBe("#/teams")
})

test("a link to the page you are already on records nothing", () => {
  __setHereForTest(parseRoute("#/team/team_001"))
  expect(routeHref({ page: "team", id: "team_001" })).toBe("#/team/team_001")
})

test("a step back does not record a step forward", () => {
  // The loop this caught: clicking a crumb built a link whose `from` pointed at
  // the page being left, so going back recorded going forward and the URL grew
  // every time.
  __setHereForTest(parseRoute("#/team/team_001?from=%2Fevent%2Fevt_002"))
  expect(routeHref({ page: "event", id: "evt_002" }, { trail: true })).toBe("#/event/evt_002")
})

test("the chain reads oldest first, and keeps each step's own tab", () => {
  const route = parseRoute("#/team/team_001?from=%2Fevent%2Fevt_002%3Ftab%3Dteams%26from%3D%252Fdiscover")
  expect(ancestorsOf(route).map(r => [r.page, r.id, r.query?.tab]))
    .toEqual([["discover", undefined, undefined], ["event", "evt_002", "teams"]])
})

test("a cold link has no ancestors, and the page's own hierarchy is what is left", () => {
  expect(ancestorsOf(parseRoute("#/team/team_001"))).toEqual([])
})
