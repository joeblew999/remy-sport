import { defineConfig } from "@playwright/test"

const baseURL = process.env.BASE_URL || "http://localhost:8787"
const isLocal = !process.env.BASE_URL

export default defineConfig({
  testDir: "./tests",
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
  workers: 1,
  reporter: "html",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  // Seeding is a precondition, not a test. A setup project runs to completion
  // before its dependents start, which fullyParallel + describe.serial cannot
  // guarantee on its own — see tests/seed.setup.ts.
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    { name: "e2e", testIgnore: /.*\.setup\.ts/, dependencies: ["setup"] },
  ],
  ...(isLocal && {
    webServer: {
      // --host localhost matches the mise dev tasks: without it wrangler
      // simulates the [[routes]] custom domain and every request reaches the
      // Worker as http://remy.ubuntusoftware.net rather than localhost.
      command: "bunx wrangler dev --host localhost",
      url: "http://localhost:8787/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 15000,
    },
  }),
})
