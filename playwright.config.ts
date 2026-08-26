import { defineConfig } from "@playwright/test"

const baseURL = process.env.BASE_URL || "http://localhost:8787"
const isLocal = !process.env.BASE_URL

export default defineConfig({
  testDir: "./tests",
  // Playwright's default testMatch is **/*.@(spec|test).*, so it collects the
  // other two suites' *.test.ts files and dies on their `bun:test` and
  // `cloudflare:test` imports. Three tiers, three runners, and none of them
  // may collect another's files:
  //   tests/unit/    bun test   pure logic, no runtime   ~20ms
  //   tests/worker/  vitest     the Worker in workerd    ~4s
  //   tests/*.spec   playwright a real browser           ~1.6m
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
    baseURL,
    trace: "on-first-retry",
  },
  // Seeding is a precondition, not a test. A setup project runs to completion
  // before its dependents start, which fullyParallel + describe.serial cannot
  // guarantee on its own — see tests/seed.setup.ts.
  projects: [
    // Rendering tests, and nothing else in the pipeline.
    //
    // No `dependencies`: these hand the query cache their data through
    // `seedCache`, so they need no seeded database, no signed-in actor and no
    // network. Making them depend on `seed`/`auth` would put a D1 write and six
    // sign-ins in front of an assertion about a <div>.
    { name: "render", testMatch: /.*-render\.spec\.ts/ },

    { name: "seed", testMatch: /seed\.setup\.ts/ },
    // Signs in once per actor and saves cookies; every spec that merely needs
    // to BE someone loads that state instead of signing in for itself.
    { name: "auth", testMatch: /auth\.setup\.ts/, dependencies: ["seed"] },
    {
      name: "e2e",
      testIgnore: [
        /.*\.setup\.ts/,
        /tests\/unit\//,
        /tests\/worker\//,
        /.*-render\.spec\.ts/,
        /devices\.spec\.ts/,
      ],
      dependencies: ["auth"],
    },
    // Last, and alone. Session state is global per user, so "sign out all other
    // devices" revokes the very cookies auth.setup.ts saved for that actor —
    // which any concurrently-running file is relying on. Running it after
    // everything else makes that harmless instead of a coin flip.
    { name: "devices", testMatch: /devices\.spec\.ts/, dependencies: ["e2e"] },
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
