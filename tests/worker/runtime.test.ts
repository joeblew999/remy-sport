/**
 * What the Worker runtime gives us, asserted rather than assumed.
 *
 * This file exists because of a specific failure mode: a confident, plausible,
 * well-formatted recommendation to rewrite our date handling on Temporal,
 * asserting that Cloudflare's runtime had it natively enabled by mid-2026. It
 * does not. Asking workerd directly took a minute; believing it would have cost
 * a day and produced a Worker that throws on the first request.
 *
 * So the answer lives in a test instead of in anybody's memory, and it is a
 * tripwire in both directions:
 *
 *   - While Temporal is absent, this passes and the question is settled.
 *   - The day it appears, this FAILS ON PURPOSE, with instructions. That is the
 *     signal to revisit, and the whole reason to write it this way.
 *
 * A failing build on somebody else's release would be a bad trade, but that is
 * not what happens here: wrangler is pinned exactly and bun.lock is committed,
 * so the runtime only changes when one of us bumps it deliberately. That is
 * exactly the moment this should speak up.
 */

import { it, expect } from "vitest"

/**
 * Temporal is not available, and the SPA is not waiting for it either.
 *
 * Measured 2026-08-27 on miniflare 5.20260815.0-alpha, at both our
 * compatibility_date (2025-09-01) and at 2026-08-01. Undefined in both.
 * Cloudflare's compatibility-flags documentation lists no flag for it.
 *
 * When this fails, the decision to revisit is:
 *
 *   1. Check Cloudflare has *documented* it, not just shipped it — a global
 *      appearing before the docs do is a preview, and pinning our date handling
 *      to a preview is how we end up on the wrong side of a breaking change.
 *   2. The Worker gains little either way. Every date call site here is
 *      `new Date().toISOString()` for a timestamp or `new Date()` for a drizzle
 *      `updatedAt`. There is no timezone arithmetic on this side at all.
 *   3. The SPA is where the date logic actually lives, and it ships to Safari.
 *      Temporal in the Worker but not the browser means two dialects, which is
 *      worse than one that works.
 *
 * In other words: this failing is permission to think about it, not a
 * requirement to adopt it. Deleting the test is a fine outcome; so is widening
 * it to assert the shape we depend on.
 */
it("Temporal is still absent from the Worker runtime", () => {
  const present = typeof (globalThis as Record<string, unknown>).Temporal !== "undefined"
  expect(
    present ? "Temporal has arrived — read this test's comment before using it" : "absent",
  ).toBe("absent")
})

/**
 * `Intl.DateTimeFormat` does the one thing we actually need, and it is native.
 *
 * Formatting an instant on a named IANA clock is the whole timezone
 * requirement: `event.timezone` is captured once from `request.cf.timezone` and
 * every rendering goes through this. It is what makes both a date library and
 * Temporal unnecessary rather than merely unavailable.
 *
 * Asserted here and not only in the SPA because a runtime can ship `Intl`
 * without the full timezone database — a real and quiet failure, where an
 * unknown zone throws instead of degrading.
 */
it("Intl formats an instant on a named IANA clock", () => {
  const at = new Date("2026-08-27T03:00:00Z")
  const bangkok = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at)
  const melbourne = new Intl.DateTimeFormat("en", {
    timeZone: "Australia/Melbourne",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at)

  // +07:00 and +10:00 on that date — the same instant, two clocks.
  expect(bangkok).toBe("10:00")
  expect(melbourne).toBe("13:00")
})

/** An IANA name the runtime does not know must throw, not silently pick one. */
it("an unknown timezone throws rather than guessing", () => {
  expect(() => new Intl.DateTimeFormat("en", { timeZone: "Mars/Olympus_Mons" })).toThrow()
})
