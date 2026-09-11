import { describe, expect, it } from "vitest"
import { createApiClient } from "../../src/api-client"

/**
 * The base URL has to be absolute, and the failure has to say so.
 *
 * This is here because of a failed staging deploy. `apiFor(request)` defaulted
 * its base to `""`, which is a perfectly good `string`, so the build was clean
 * — and the link then built `new URL("/api")` lazily at the first call and
 * threw "Invalid URL" from inside its codec, naming neither the helper nor the
 * test that used it. The e2e gate caught it, which is the gate working, but it
 * caught it at the slowest possible moment.
 */

describe("createApiClient", () => {
  it("refuses a relative base URL, naming what to pass instead", () => {
    expect(() => createApiClient("")).toThrow(/must be absolute/)
    expect(() => createApiClient("/api")).toThrow(/must be absolute/)
    // The message has to carry the fix, not just the complaint.
    expect(() => createApiClient("")).toThrow(/originOf|baseURL/)
  })

  it("accepts an absolute one", () => {
    expect(() => createApiClient("https://remy.test")).not.toThrow()
    expect(() => createApiClient("http://127.0.0.1:8787")).not.toThrow()
  })
})

/**
 * The helper's own default, exercised where it is cheap to exercise.
 *
 * `apiFor(request)` is only ever called from Playwright, so nothing in the
 * fast tiers touched its default base — and its default was `""`. The suite
 * that used it runs on a deploy, so the first thing to notice was a failed
 * deploy. This file imports the helper directly, which is why the helper no
 * longer imports `@playwright/test` through `./auth.ts`.
 */
describe("apiFor", () => {
  it("defaults to an absolute base, so a caller that passes none still works", async () => {
    const { apiFor } = await import("../helpers/api")
    // A stub context: construction is what is under test, not the round trip.
    const request = { fetch: async () => ({ status: () => 200, headers: () => ({}), body: async () => Buffer.from("{}") }) }
    expect(() => apiFor(request as never)).not.toThrow()
  })
})
