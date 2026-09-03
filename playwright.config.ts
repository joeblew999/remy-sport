import { defineConfig } from "@playwright/test"

/**
 * Port 8788, not 8787.
 *
 * The e2e tier runs its own Worker with its own assets and its own D1 (see
 * scripts/lib/e2e-server.ts). 8787 is the developer's dev server, and sharing
 * it meant test runs mutating data somebody was using and rebuilds landing
 * mid-run. BASE_URL still overrides, which is how this suite is pointed at a
 * real deployment.
 */
const baseURL = process.env.BASE_URL || "http://localhost:8788"
const isLocal = !process.env.BASE_URL

export default defineConfig({
  testDir: "./tests/e2e",
  // One directory per tier, so nothing here needs a filename convention to tell
  // the suites apart:
  //   tests/unit/    bun test   pure logic
  //   tests/worker/  vitest     the Worker in workerd
  //   tests/render/  playwright a browser, no backend  (playwright.render.config.ts)
  //   tests/e2e/     playwright a browser + real Worker (this file)
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Remote runs (test:deployed) retry as well as CI. Against the deployed
  // origin the suite crosses the network and hits D1 replicas that are only
  // eventually consistent — right after a migration clears and re-seeds, a
  // freshly created session can briefly not be visible to the next read, which
  // surfaces as a signed-in page rendering as signed-out. Verified flaky, not
  // deterministic: the same commit failed 2/68 then passed 68/68 unchanged.
  // Local runs keep 0 so genuine failures stay loud and fast.
  retries: process.env.CI || !isLocal ? 2 : 0,
  // One worker, everywhere — not just CI.
  //
  // Sign-in codes are single-use and the six seeded actors are shared, so two
  // tests authenticating as the same actor race by construction: whichever
  // redeems first consumes the verification record, and the other gets
  // INVALID_OTP. That is not flakiness to retry away, it is two tests using one
  // credential. A fixed code does not help, because the *record* is consumed,
  // not the value.
  //
  // The alternative was a throwaway account per test, but roles are assigned by
  // the admin-only createUser, so a test cannot provision its own organizer.
  // Serialising costs a few seconds on a suite this size and removes the whole
  // class of failure. Revisit if the suite grows enough for that to hurt.
  // 4, not 1. It was serialised because sign-in codes are consumed on use and
  // parallel tests ate each other's — auth.setup.ts now signs everyone in once
  // up front, so nothing races for a code. 2.8min -> ~50s. Blocks that share
  // created orgs or teams are marked describe.serial individually.
  workers: 2,
  reporter: "html",
  use: {
    /**
     * WebKit, not Chromium.
     *
     * It is the strictest engine we can run and it is what a phone actually
     * uses, so it is the honest baseline. That is not a preference: Chromium
     * hid a real bug for as long as this suite existed. `baseURL` was pinned to
     * an https URL, so Better Auth issued a `__Secure-` prefixed session cookie
     * on http://localhost — which Chromium stores and WebKit refuses. Sign-in
     * returned 200, the session was empty, and 35 green tests said nothing.
     *
     * The cost is real and small: the render tier is unchanged at ~8s, and e2e
     * goes from ~8s to ~23s. Worth it to test the browser most of these readers
     * hold.
     */
    browserName: "webkit",
    baseURL,
    trace: "on-first-retry",
  },
  // Seeding is a precondition, not a test. A setup project runs to completion
  // before its dependents start, which fullyParallel + describe.serial cannot
  // guarantee on its own — see tests/seed.setup.ts.
  projects: [
    { name: "seed", testMatch: /seed\.setup\.ts/ },
    // Signs in once per actor and saves cookies; every spec that merely needs
    // to BE someone loads that state instead of signing in for itself.
    { name: "auth", testMatch: /auth\.setup\.ts/, dependencies: ["seed"] },
    {
      name: "e2e",
      testIgnore: [/.*\.setup\.ts/, /devices\.spec\.ts/, /authz\.spec\.ts/],
      dependencies: ["auth"],
    },
    /**
     * Also last, and for a neighbouring reason.
     *
     * The role switcher performs a **real OTP sign-in** as the actor whose
     * button is clicked — that is the point of the test, since the old version
     * asserted six buttons were visible and never clicked one, so the switcher
     * kept posting passwords for weeks after password sign-in was removed.
     *
     * `spa-login.spec.ts` also signs in for real, and with `workers: 2` the two
     * ran together and competed for the same seeded accounts' codes: the badge
     * stayed on the previous actor and the test failed at 32 of 35. It was
     * characterised as an occasional flake; measured, it was two runs in three.
     *
     * Sequencing it costs a few seconds and removes the race, which is what the
     * `devices` project below already does for the same class of problem. The
     * alternative — a private actor nothing else signs in as — pushes the
     * collision one seeded account further away rather than removing it.
     */
    { name: "authz", testMatch: /authz\.spec\.ts/, dependencies: ["e2e"] },
    // Last, and alone. Session state is global per user, so "sign out all other
    // devices" revokes the very cookies auth.setup.ts saved for that actor —
    // which any concurrently-running file is relying on. Running it after
    // everything else makes that harmless instead of a coin flip.
    /**
     * After `authz`, not merely after `e2e`.
     *
     * Both sign in for real, and depending on the same project made them
     * siblings — dispatched concurrently, racing for the same seeded accounts'
     * verification rows. That is the failure AGENTS.md describes twice: a
     * second code request for one address invalidates the first, and the loser
     * reports a missing identity element rather than a rejected code.
     *
     * It survived while the tier shared the dev server because that database
     * carried enough accumulated state to blur the timing. On a database that
     * starts empty every run it is deterministic, and this test failed every
     * time — which is the isolation doing its job before it had finished
     * paying for itself.
     */
    { name: "devices", testMatch: /devices\.spec\.ts/, dependencies: ["authz"] },
  ],
  ...(isLocal && {
    webServer: {
      /**
       * This tier's own Worker. See scripts/lib/e2e-server.ts for what it
       * isolates and why — assets, database and port, none of them shared with
       * a running dev server.
       *
       * `reuseExistingServer: false` unconditionally: reusing was the whole
       * problem. On its own port there is nothing to reuse, and a leftover
       * process from a killed run should be replaced rather than trusted.
       */
      command: "bun scripts/lib/e2e-server.ts",
      url: "http://localhost:8788/api/health",
      reuseExistingServer: false,
      // Longer than the old 15s: this one builds its assets and applies
      // migrations before the Worker starts.
      timeout: 60000,
    },
  }),
})
