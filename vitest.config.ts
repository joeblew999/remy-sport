import { defineConfig } from "vitest/config"
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers"

/**
 * Worker tests, run inside workerd — no wrangler dev, no browser, no port.
 *
 * The middle tier this repo was missing. 61 of the 151 Playwright specs never
 * opened a browser: they were HTTP calls against the Worker, paying for a real
 * server process and a Playwright runner to make them. Here the Worker is
 * loaded into the test process and `SELF.fetch()` calls its fetch handler
 * directly, with Miniflare providing D1 and R2 from the same wrangler.toml
 * production uses.
 *
 *   mise run test:unit    pure logic, no runtime      ~20ms
 *   mise run test:worker  the Worker, in workerd      this file
 *   mise run test         a real browser, and only that
 *
 * `isolatedStorage` gives each test file its own D1 stack, so specs cannot race
 * each other over shared rows — which is exactly what held Playwright to two
 * workers.
 *
 * `cloudflareTest`, not `defineWorkersConfig`: the `./config` entrypoint was
 * removed in @cloudflare/vitest-pool-workers 0.22, which pairs with vitest 4.
 */
/**
 * The same migrations wrangler applies, handed to Miniflare's D1.
 *
 * Miniflare starts each test file with an empty database. Reading the real
 * migration files rather than a fixture means these tests exercise the schema
 * that ships — a migration that breaks the app breaks them too.
 */
const migrations = await readD1Migrations("./src/db/migrations")

export default defineConfig({
  plugins: [
    cloudflareTest({
      isolatedStorage: true,
      wrangler: { configPath: "./wrangler.toml" },
      miniflare: {
        // Never let a test reach the real mail binding, whatever wrangler.toml
        // says. `outbox` captures messages in the isolate instead of sending.
        bindings: { MAIL_TRANSPORT: "outbox", TEST_OTP: "424242", TEST_MIGRATIONS: migrations },
      },
    }),
  ],
  test: {
    include: ["tests/worker/**/*.test.ts"],
    setupFiles: ["./tests/worker/apply-migrations.ts"],
  },
})
