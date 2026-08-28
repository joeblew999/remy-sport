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
