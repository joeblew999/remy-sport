import { describe, expect, it } from "vitest"
import { api, post } from "./helpers"

/**
 * `POST /api/analytics` drops what it cannot use, and never rejects.
 *
 * A beacon cannot read a response, so a 400 would reach nobody — and worse,
 * the telemetry interceptor records 4xx as `api.refused`, so rejecting junk
 * would pollute the dataset this endpoint exists to fill. Asserted because
 * oRPC's default for an unrecognised body is exactly the 400 this must not
 * send: the permissive input schema is load-bearing, not laziness.
 *
 * Written when the route moved from Hono to `telemetry.report` in the oRPC
 * unification.
 */

describe("POST /api/analytics", () => {
  it("accepts a declared event and answers 204 with no body", async () => {
    const res = await post("/api/analytics", {
      event: "api.refused",
      fields: { route: "/api/test", method: "GET", code: "FORBIDDEN", ms: 3, status: 403 },
    })
    expect(res.status).toBe(204)
    expect(await res.text()).toBe("")
  })

  it("drops an event name the catalogue does not define, rather than refusing", async () => {
    const res = await post("/api/analytics", { event: "not.a.real.event", fields: { a: 1 } })
    expect(res.status).toBe(204)
  })

  it("drops a malformed body rather than answering 400", async () => {
    for (const body of [{}, { event: "api.refused" }, { fields: { a: 1 } }, { event: 42 }]) {
      const res = await post("/api/analytics", body)
      expect(res.status, `body ${JSON.stringify(body)} must be dropped, not refused`).toBe(204)
    }
  })

  it("keeps the accepted event where the local ring can be read back", async () => {
    const res = await api("/api/dev/events")
    expect(res.status).toBe(200)
    const body = (await res.json()) as { since: string; events: { event: string }[] }
    expect(body.since).toEqual(expect.any(String))
    expect(body.events.some((e) => e.event === "api.refused")).toBe(true)
  })
})
