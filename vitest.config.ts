import { defineConfig } from "vitest/config"
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers"

/**
 * Every test that is not a browser, under one runner.
 *
 *   unit    pure logic, node                          tests/unit
 *   repo    the rules this repo keeps, read off the tree   tests/repo
 *   worker  the Worker inside workerd, with a real D1  tests/worker
 *
 * The unit tier ran on `bun test` and the repo checks were fifteen scripts
 * spawned one by one by an 855-line orchestrator with its own phases, budgets
 * and parallelism. Vitest already runs files in parallel and reports the slow
 * ones; the orchestrator is gone and `vitest run` is the whole answer.
 *
 * The browser tiers stay on Playwright (playwright.config.ts for e2e and the
 * screenshot walk, playwright.render.config.ts for the no-backend tier).
 */

/**
 * The same migrations wrangler applies, handed to Miniflare's D1.
 *
 * Miniflare starts each test file with an empty database. Reading the real
 * migration files rather than a fixture means these tests exercise the schema
 * that ships — a migration that breaks the app breaks them too.
 */
const migrations = await readD1Migrations("./src/db/migrations")

/** The build stamp vite.config.ts bakes in (src/build.d.ts); the tests are no build. */
const define = {
  __BUILD__: JSON.stringify({
    commit: "test",
    branch: "test",
    builtAt: "1970-01-01T00:00:00.000Z",
    environment: "dev",
    app: "0.0.0",
    github: null,
  }),
}

export default defineConfig({
  test: {
    projects: [
      { define, test: { name: "unit", include: ["tests/unit/**/*.test.ts"], environment: "node" } },
      { define, test: { name: "repo", include: ["tests/repo/**/*.test.ts"], environment: "node" } },
      {
        define,
        plugins: [
          cloudflareTest({
            // Each test file gets its own D1 stack, so specs cannot race each
            // other over shared rows. That is the pool's own behaviour now —
            // 0.22's option schema has no `isolatedStorage` and strips unknown
            // keys, so the `isolatedStorage: true` this config carried for a
            // year was already being ignored. Typechecking the config is what
            // said so.
            wrangler: { configPath: "./wrangler.toml" },
            miniflare: {
              // Never let a test reach the real mail binding, whatever wrangler.toml
              // says. `outbox` captures messages in the isolate instead of sending.
              bindings: {
                MAIL_TRANSPORT: "outbox",
                // The worker tier is a dev environment: it reads the outbox, asserts
                // on the seed route and the demo picker, and needs every sample. The
                // fallback is production, so leaving this out would silently strip
                // the routes half these tests are about.
                ENVIRONMENT: "dev",
                // TEST_OTP is deliberately absent. Dev's policy row says
                // `signInCode: "derived"`, so the code comes from the table and no
                // secret is involved — and every sign-in in this tier proves that,
                // because they would all fail on a random code if it did not work.
                // Setting it here would let the derivation break unnoticed.
                TEST_MIGRATIONS: migrations,
                // A throwaway VAPID pair, so push is *on* in tests and the code that
                // signs and encrypts actually runs. With these absent the sender
                // short-circuits and a push test would pass by doing nothing —
                // exactly the shape of test that lets a broken feature ship.
                //
                // Used nowhere else. Its presence in a public repo costs nothing:
                // it can only sign for subscriptions created against itself, and
                // every one of those is made and thrown away inside a single test.
                VAPID_SUBJECT: "mailto:test@remy.test",
                VAPID_PUBLIC_KEY:
                  "BFB12hNwXz2bSHhJyLc4tKbhvcerRaQbzgAFs9jZ-4wMAId90HY43vCYGLE4azKZPlPQn5pcsifiKD1ZiwaIRIo",
                VAPID_PRIVATE_KEY: "tBr-FkbcKihsliWUd3ABzOMiSl8fu0cqHQQ9uDpl2bo",
              },
            },
          }),
        ],
        test: {
          name: "worker",
          include: ["tests/worker/**/*.test.ts"],
          setupFiles: ["./tests/worker/apply-migrations.ts"],
          // No `dangerouslyIgnoreUnhandledErrors`. Better Auth used to leave an
          // unhandled rejection behind because workerd fired `unhandledrejection`
          // before the microtask checkpoint; `unhandled_rejection_after_microtask_checkpoint`
          // in wrangler.toml fixed it at the runtime, so a real unhandled
          // rejection fails the run again, as it should.
        },
      },
    ],
  },
})
