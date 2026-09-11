import { SELF } from "cloudflare:test"
import { describe, expect, it } from "vitest"
import { apiWith } from "../helpers/api"

/**
 * The shared client helper works in this tier too, not only under Playwright.
 *
 * `tests/helpers/api.ts` takes the fetch as a parameter for exactly this
 * reason: Playwright holds an `APIRequestContext` carrying the suite's stored
 * session, and this tier holds `SELF.fetch`, which reaches the Worker inside
 * the isolate. A helper that hardcoded either would work for one tier and
 * quietly sign the other out, or send it over a network that is not running.
 *
 * This test is the guard on that shape. If someone later builds the client
 * from the global fetch, the Playwright suites keep passing and this one stops
 * — which is the right way round, because the failure would otherwise show up
 * as "the e2e suite is signed out" a long way from its cause.
 */

describe("the shared API client helper", () => {
  it("builds a working client from SELF.fetch", async () => {
    const api = apiWith((request) => SELF.fetch(request), "https://remy.test")

    const health = await api.health.get()
    expect(health.status).toBe("ok")
    // The pool binds ENVIRONMENT=dev, so this also proves the call reached
    // *this* Worker rather than anything else answering.
    expect(health.environment).toBe("dev")
  })

  it("carries a procedure's types, not a hand-written shape", async () => {
    const api = apiWith((request) => SELF.fetch(request), "https://remy.test")
    const { current } = await api.health.versions()
    // The placeholder BUILD var from wrangler.toml. Asserted through the
    // client rather than a parsed body, so a renamed field fails the build.
    expect(current.app).toBe("0.0.0")
    expect(current.git.commit).toBe("dev")
  })
})
