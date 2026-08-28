import { describe, it, expect } from "bun:test"
import { describePlace } from "../../src/web/lib/devices"


/**
 * Where a session started, as a person would read it.
 *
 * The devices page exists to answer "was that me?", and an IP address cannot.
 * Cloudflare resolves city, country and network at the edge on every request,
 * so this costs no lookup and no third party — see `sessionPlace` in auth.ts.
 *
 * Every part is optional because every part genuinely can be missing: a session
 * created under `wrangler dev` never crossed Cloudflare and has none of them.
 */
describe("describePlace", () => {
  it("reads as a sentence when everything is known", () => {
    expect(describePlace({ city: "Bangkok", country: "TH", network: "AIS Fibre" }))
      .toBe("Bangkok, TH · AIS Fibre")
  })

  it("a country alone still rules a session in or out", () => {
    expect(describePlace({ country: "TH" })).toBe("TH")
  })

  it("keeps the network when the place is unknown", () => {
    expect(describePlace({ network: "TrueMove H" })).toBe("TrueMove H")
  })

  it("is null when nothing is known, so the caller can fall back to the address", () => {
    // Every local session looks like this: `wrangler dev` never sees Cloudflare.
    expect(describePlace({})).toBeNull()
    expect(describePlace({ city: null, country: null, network: null })).toBeNull()
  })

  it("does not render a dangling separator when only one half is present", () => {
    expect(describePlace({ city: "Bangkok" })).toBe("Bangkok")
    expect(describePlace({ city: "Bangkok", network: "" })).toBe("Bangkok")
  })
})
