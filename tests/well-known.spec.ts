import { test, expect } from "@playwright/test"

// Apple/Android deep-link association files, served by the Worker so we control
// content-type and avoid redirects (both are hard requirements for Apple).
//
// Apple's CDN caches the AASA aggressively, so serving a placeholder with wrong
// identifiers is worse than serving nothing. These tests lock in that a missing
// configuration produces a 404 rather than a malformed file.

test.describe("Associated Domains / App Links", () => {
  test("AASA 404s while APPLE_TEAM_ID / APPLE_BUNDLE_ID are unset", async ({ request }) => {
    const res = await request.get("/.well-known/apple-app-site-association")
    expect(res.status()).toBe(404)
    expect(res.headers()["content-type"]).toContain("application/json")
    expect((await res.json()).error).toContain("Associated Domains not configured")
  })

  test("assetlinks 404s while the Android identifiers are unset", async ({ request }) => {
    const res = await request.get("/.well-known/assetlinks.json")
    expect(res.status()).toBe(404)
  })

  test("AASA path is served by the Worker, never redirected", async ({ request }) => {
    // Apple refuses to follow redirects when fetching this file.
    const res = await request.get("/.well-known/apple-app-site-association", {
      maxRedirects: 0,
    })
    expect([200, 404]).toContain(res.status())
    expect(res.status()).not.toBe(301)
    expect(res.status()).not.toBe(302)
    expect(res.status()).not.toBe(307)
  })
})
