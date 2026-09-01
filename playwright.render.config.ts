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
  /**
   * How many WebKit instances, and it depends on who else is running.
   *
   * Playwright's default is half the cores — 6 here. Alone that is right; the
   * tier is 26.5s at 6 and 33.6s at 3, because nothing is competing for the
   * other six.
   *
   * Inside `check` it is wrong. Phase 1 runs this beside `test:worker`, whose
   * ~11 workerd isolates make ~17 processes asking for twelve cores, and both
   * tiers lose more to the oversubscription than either gains from the extra
   * parallelism. Measured, five samples of each configuration, total `check`
   * wall clock as min/median/max:
   *
   *     6 workers (the default) ....  43.0 / 50.8 / 55.1     spread 12.1s
   *     4 workers ..................  39.0 / 41.6 / 42.8     spread  3.8s
   *     3 workers ..................  40.6 / 41.1 / 41.8     spread  1.2s
   *     sequential, not concurrent .  46.1 / 46.5 / 49.3     spread  3.2s
   *
   * Three, not four: four has the better single sample and three has the better
   * median and a spread three times tighter. **The spread is the finding.** The
   * default configuration varies by twelve seconds run to run, which is where
   * the budget flakiness came from — not from a tier that got slower.
   *
   * Sequential is in the table because it is the honest alternative: if
   * oversubscription is the problem, not overlapping at all is a fix. It is a
   * real improvement over the uncapped default and still 5.4s worse than
   * capping, so the concurrent shape earns its place.
   *
   * `check` sets RENDER_WORKERS=3 for its phase 1 and nothing else does, so a
   * standalone `mise run test:render` keeps all six.
   */
  workers: Number(process.env.RENDER_WORKERS) || undefined,
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
    /**
     * No service worker, because `page.route` cannot see through one.
     *
     * main.tsx registers it with `immediate: true`, and `vite preview` serves
     * dist/web/sw.js — so once it claims the page, every /rpc call is made BY the
     * worker and Playwright's route handler never sees it. The test's `sent`
     * stays "" and the assertion reads as "save must reach the server".
     *
     * That is why this tier was concurrency-sensitive and looked flaky. Measured:
     * the full suite passes 201/201 at one worker and fails at two and at three,
     * a different spec each time. Serial runs finish each test before the worker
     * activates; under load it wins the race. Nothing about the failures was
     * random — retrying reproduced them, and a longer timeout only made them
     * take 14.3s.
     *
     * This tier states it has no network at all: seedCache answers every call
     * and the fonts are blocked. A service worker has no business in it.
     */
    serviceWorkers: "block",
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
