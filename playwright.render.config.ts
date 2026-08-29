import { defineConfig, devices } from "@playwright/test"

/**
 * Rendering tests, against a static file server — no Worker at all.
 *
 * These seed the query cache before the bundle runs, so they never make a
 * network call. They were still paying for `wrangler dev` to boot, a D1 to
 * migrate and six actors to sign in, because Playwright's `webServer` is
 * config-wide and the main config needs all of that for the E2E tier.
 *
 * A separate config is the only way to give one project a different server.
 * `vite preview` serves the built `dist/web` and nothing else.
 *
 * Fully parallel with no worker cap: there is no shared database to race over,
 * which is the constraint that holds the E2E tier to two.
 */
export default defineConfig({
  testDir: "./tests/render",
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
  fullyParallel: true,
  reporter: process.env.CI ? "line" : "list",
  /**
   * Fail fast, because there is nothing here that can legitimately be slow.
   *
   * This tier has **no network**: `seedCache` answers every `/rpc` call with a
   * 404 and the fonts are blocked, so a passing test is a page load and an
   * assertion — the slowest in the suite is under a second. Playwright's
   * default 30s expect timeout therefore only ever applies to something that is
   * never going to appear.
   *
   * That default was costing three minutes a run whenever a fixture drifted:
   * six broken tests, thirty seconds each, waiting for an element that could not
   * exist. The failure was instant and the *report* of it was not, which is the
   * difference between a loop you can iterate in and one you go and do
   * something else during.
   *
   * Five seconds is ten times the slowest real assertion here and a sixth of
   * the cost of a wrong one. The e2e tier keeps the default: it has a real
   * Worker, a real database and real sign-ins, where waiting is legitimate.
   */
  timeout: 15_000,
  expect: { timeout: 5_000 },
  /**
   * Name any file over three seconds, every run.
   *
   * Playwright's default threshold is fifteen seconds, which in this tier means
   * never — the whole suite runs in fourteen. A threshold that cannot fire is
   * the same as no reporting at all, and it is why a six-fold slowdown went
   * unremarked for a session. Three seconds is about four times the slowest
   * single test here.
   */
  reportSlowTests: { max: 5, threshold: 3_000 },
  use: {
    baseURL: "http://localhost:4173",
    trace: "on-first-retry",
    // `devices["Desktop Safari"]`, not Chrome — and it must come BEFORE
    // browserName, because the device preset carries its own and would
    // otherwise put it back.
    ...devices["Desktop Safari"],
    browserName: "webkit",
  },
  webServer: {
    // `--outDir` matches vite.config.ts's build output.
    command: "bun x vite preview --config src/web/vite.config.ts --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
