import { describe, expect, it } from "vitest"
import { routeShape } from "../../src/web/lib/report"

/**
 * A crash report says which *kind* of page broke, and nothing about who was
 * looking at it.
 *
 * Two reasons, and both matter. An id shards the data, so four hundred broken
 * team pages read as four hundred separate one-off failures rather than one bug
 * worth fixing. And it puts a person's browsing into a telemetry store, for no
 * gain: knowing the route is `/team/:id` is what tells you where to look.
 */
describe("routeShape", () => {
  it("removes ids", () => {
    expect(routeShape("#/team/team_002")).toBe("/team/:id")
    expect(routeShape("#/watch/gam_017")).toBe("/watch/:id")
    expect(routeShape("#/org/org_002")).toBe("/org/:id")
  })

  it("keeps real route segments", () => {
    expect(routeShape("#/discover")).toBe("/discover")
    expect(routeShape("#/live")).toBe("/live")
  })

  it("drops the query string, which can carry anything", () => {
    expect(routeShape("#/discover?city=BANGKOK&q=someone")).toBe("/discover")
  })

  it("calls the empty hash the root rather than an empty string", () => {
    expect(routeShape("")).toBe("/")
    expect(routeShape("#")).toBe("/")
  })
})
