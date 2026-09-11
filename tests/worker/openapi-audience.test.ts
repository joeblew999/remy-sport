import { SELF } from "cloudflare:test"
import { describe, expect, it } from "vitest"

/**
 * The published document describes what this deployment actually mounts.
 *
 * Production served all seven dev operations — seed, the outbox pair, the OTP
 * clear, the template preview, the account picker, prune-sessions — with their
 * schemas, while answering 404 to every one. The 404s were right. A document
 * advertising an internal surface to anyone who fetches it was not: it is a
 * map of endpoints that exist somewhere, handed to people who cannot call them
 * and shouldn't know the shape.
 *
 * The pool binds `ENVIRONMENT=dev`, which grants every dev capability, so here
 * they SHOULD be described — that is the other half of the rule, and a filter
 * that dropped them everywhere would pass a test that only checked production.
 */

const paths = async () => {
  const res = await SELF.fetch("https://remy.test/api/openapi.json")
  expect(res.status).toBe(200)
  return Object.keys(((await res.json()) as { paths: Record<string, unknown> }).paths)
}

describe("the served OpenAPI document", () => {
  it("describes the dev endpoints this environment mounts", async () => {
    const served = await paths()
    // dev grants seedRoute, devMailRoutes, devSessionRoutes and
    // hasLocalEventStore, so all of these are real here.
    for (const path of ["/seed", "/dev/outbox", "/dev/otp", "/dev/prune-sessions", "/dev/events"]) {
      expect(served, `${path} is mounted here and should be described`).toContain(path)
    }
  })

  it("still describes the domain the product is for", async () => {
    const served = await paths()
    expect(served).toContain("/events")
    expect(served).toContain("/teams")
  })

  it("leaves out infrastructure that is not a dev capability", async () => {
    // Reachable, deliberately unauthenticated, and not part of the API anyone
    // is meant to build against — which is what a published reference is for.
    const served = await paths()
    for (const path of ["/health", "/versions", "/analytics", "/unsubscribe"]) {
      expect(served, `${path} is infrastructure, not a documented endpoint`).not.toContain(path)
    }
  })
})
