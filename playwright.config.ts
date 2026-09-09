import { LOCAL_BROWSER_ORIGIN } from "./scripts/lib/local-browser.ts"
import { defineConfig } from "@playwright/test"

const baseURL = process.env.BASE_URL || LOCAL_BROWSER_ORIGIN
const isLocal = !process.env.BASE_URL
// Reading configuration (lint, editor tooling) must not require a running test.
// Migration and Vite validate the run directory before touching local storage.

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
  /**
   * Playwright's default assertion budget is five seconds. That was comfortable
   * at three languages and is marginal at twenty-seven, and the reason is the
   * environment rather than the product.
   *
   * These tiers run against a dev server that compiles a route the first time
   * it is asked for, and the app now fetches `/api/reference` before it can
   * render a label: 332KB and 8,004 translated names, because every vocabulary
   * row carries one entry per locale. The first data-dependent assertion after
   * a navigation therefore waits on a cold transform plus that fetch, and it
   * sits either side of five seconds depending on what else the machine is
   * doing. `connected-gui` passed 6/6 in 18s and then failed 2 in 42s on the
   * next run, with nothing changed between them.
   *
   * Raising it hides nothing, and that is worth being explicit about: an expect
   * timeout only governs how long a *failing* assertion waits before it is
   * reported. A passing test is not slowed by one seconds. The evidence that
   * the product is fine is `test:render` — the same screens against a built
   * bundle — at 402 passed.
   *
   * The payload growth is real and is owned: the N×N `names` matrix is what
   * docs/2026-09-09-16-pretranslated-reference-data.md retires. When it does,
   * this can go back down.
   */
  expect: { timeout: 15_000 },
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
    // `teardown` runs after everything that depended on this project, which is
    // every spec. The sessions it opens are the suite's credentials, so they
    // cannot be revoked per-test; they are ended once, at the end, so the run
    // leaves the system holding no more sessions than it found. That matters
    // most where it cannot be reset — see tests/e2e/auth.teardown.ts.
    { name: "auth", testMatch: /auth\.setup\.ts/, dependencies: ["seed"], teardown: "auth-teardown" },
    { name: "auth-teardown", testMatch: /auth\.teardown\.ts/ },
    {
      name: "e2e",
      testIgnore: [/.*\.setup\.ts/, /authz\.spec\.ts/, /admin-console\.spec\.ts/],
      dependencies: ["auth"],
    },
    /**
     * After the rest, on its own, for the reason the role switcher below is.
     *
     * The admin console signs in through the login form as the admin and the
     * coach — a real one-time code each — while, with `workers: 2`, the other
     * specs that sign in the same way run beside it. Two requests for the same
     * person's code inside Better Auth's re-send window leave one of them
     * redeeming a code the other already spent, and the symptom is a sign-in
     * that never completes: the code step waits out its timeout on a cold
     * `vite dev`. Measured on 2026-09-08 as two failures in five full runs,
     * each in a different admin-console test. Sequenced, it signs in alone.
     */
    { name: "admin", testMatch: /admin-console\.spec\.ts/, dependencies: ["e2e"] },
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
     * Sequencing it costs a few seconds and removes the race. The alternative —
     * a private actor nothing else signs in as — pushes the collision one
     * seeded account further away rather than removing it.
     */
    { name: "authz", testMatch: /authz\.spec\.ts/, dependencies: ["admin"] },
    /**
     * Screenshots, not tests — `bun run shots`, which names this project and
     * nothing else. Everything about its environment is this tier's: the same
     * Worker, the same seeded database, the same signed-in states, which is
     * why it lives here rather than in a config of its own (it had one, whose
     * whole content was "the same as e2e"). `bun run test:e2e` names the e2e, admin
     * and authz projects, so a test run never takes pictures.
     */
    { name: "media", testMatch: /moq\.media\.ts/, dependencies: ["auth"], use: { trace: "off", screenshot: "off", video: "off" } },
    { name: "shots", testMatch: /screens\.shots\.ts/, dependencies: ["auth"] },
  ],
  ...(isLocal && {
    webServer: {
      // Fresh storage per run; never attach tests to an existing server.
      /**
       * The dependency cache is discarded too, for the same reason the storage
       * is: this tier attaches to nothing it did not create.
       *
       * Vite pre-bundles dependencies into `node_modules/.vite/deps` under
       * content-hashed names. When it decides to re-optimise — which a session
       * of ordinary editing will provoke — it writes new hashes, and a page
       * already holding the old HTML asks for a file that no longer exists:
       *
       *   Pre-transform error: The file does not exist at
       *   ".../node_modules/.vite/deps/libav-n1Uis8Vq.js"
       *
       * The app then fails to load and the specs fail somewhere that looks
       * nothing like a cache. That cost a deploy: the tree held
       * `libav-B2wXDnFI.js` while the page asked for `libav-n1Uis8Vq.js`.
       *
       * Removing it costs one cold optimise per run and makes the tier
       * reproducible, which is the trade this project has already made
       * everywhere else in this config.
       */
      command: "rm -rf node_modules/.vite && bun run db migrate-local --test-run && bun run dev --mode e2e",
      url: `${LOCAL_BROWSER_ORIGIN}/api/health`,
      reuseExistingServer: false,
      /**
       * 60s was enough at three languages and is not at twenty-seven.
       *
       * This budget covers a migration, a seed and a cold Vite start, and the
       * seed is what grew: every vocabulary row carries a `names` object with
       * one entry per locale, so the generated SQL is now 866 statements and
       * ~500KB. Nothing here got slower per statement; there is simply nine
       * times as much of it as when the number was written.
       *
       * Raised rather than tuned, because this is a readiness budget for a
       * cold dev server and not an assertion about how fast the product is. A
       * test that fails at 61 seconds is asserting a latency nobody chose.
       *
       * The growth itself is real and is owned elsewhere: the N×N `names`
       * matrix is what docs/2026-09-09-16-pretranslated-reference-data.md
       * retires, and /api/reference has grown the same way — 245KB at twenty
       * locales, all of them sent to every reader to render one.
       */
      timeout: 180_000,
    },
  }),
})
