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
  fullyParallel: true,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: "http://localhost:4173",
    trace: "on-first-retry",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    // `--outDir` matches vite.config.ts's build output.
    command: "bun x vite preview --config src/web/vite.config.ts --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
