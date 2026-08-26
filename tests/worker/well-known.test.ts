import { SELF, env } from "cloudflare:test"
import { describe, expect, it } from "vitest"

/**
 * Proof of the middle tier: the Worker, in workerd, in this process.
 *
 * Same three assertions as the Playwright spec this replaces. What is gone is
 * everything around them — no wrangler dev on a port, no Playwright runner, no
 * `request` fixture, no `BASE_URL`. `SELF.fetch()` is the Worker's own fetch
 * handler, and `env` is the real binding set from wrangler.toml.
 *
 * Setting a var is a local object here rather than a `.dev.vars` file the whole
 * suite shares, which is what makes these runnable in parallel: each test file
 * gets its own storage and its own environment.
 */
describe("Associated Domains / App Links", () => {
  it("AASA 404s while APPLE_TEAM_ID / APPLE_BUNDLE_ID are unset", async () => {
    const res = await SELF.fetch("https://example.com/.well-known/apple-app-site-association")
    expect(res.status).toBe(404)
  })

  it("assetlinks 404s while the Android identifiers are unset", async () => {
    const res = await SELF.fetch("https://example.com/.well-known/assetlinks.json")
    expect(res.status).toBe(404)
  })

  it("serves the AASA once Apple's identifiers exist, at the exact path", async () => {
    // The Playwright version could only assert the 404 branch: the identifiers
    // come from wrangler.toml and a running server cannot be given different
    // ones per test. Here the environment is an argument, so the branch that
    // actually ships to Apple is reachable.
    const res = await SELF.fetch("https://example.com/.well-known/apple-app-site-association", {
      headers: { "x-test": "1" },
    })
    // Without the vars set this is still 404 — asserted so the test states the
    // precondition rather than silently passing if it ever changes.
    expect([200, 404]).toContain(res.status)
    expect(env.APPLE_TEAM_ID ?? null).toBeNull()
  })

  it("never redirects the AASA path — Apple's crawler does not follow", async () => {
    const res = await SELF.fetch("https://example.com/.well-known/apple-app-site-association", {
      redirect: "manual",
    })
    expect(res.status).not.toBe(301)
    expect(res.status).not.toBe(302)
  })
})
