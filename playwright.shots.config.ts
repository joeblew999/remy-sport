import { defineConfig } from "@playwright/test"
import base from "./playwright.config"

/**
 * Screenshots, not tests — `mise run shots`.
 *
 * Everything about the environment is the E2E tier's: the same wrangler dev
 * server, the same seeded database, the same signed-in states. Only the file
 * selection differs, so this spreads that config rather than restating it —
 * a second copy of the webServer block is exactly the drift that would make a
 * screenshot stop matching what the suite runs against.
 *
 * `retries: 0` and `reporter: list`: a failed screenshot should say so once and
 * immediately. Retrying a picture two more times only delays the answer.
 */
export default defineConfig({
  ...base,
  retries: 0,
  reporter: "list",
  projects: [
    // The same two setup projects the E2E tier depends on. Seeding is a
    // precondition here for the same reason: a screenshot of an empty database
    // is a picture of nothing.
    { name: "seed", testMatch: /seed\.setup\.ts/ },
    { name: "auth", testMatch: /auth\.setup\.ts/, dependencies: ["seed"] },
    { name: "shots", testMatch: /screens\.shots\.ts/, dependencies: ["auth"] },
  ],
})
