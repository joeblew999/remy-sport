import { defineConfig } from "@playwright/test"

const baseURL = process.env.BASE_URL || "http://localhost:8787"
const isLocal = !process.env.BASE_URL

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  ...(isLocal && {
    webServer: {
      command: "bunx wrangler dev",
      url: "http://localhost:8787/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 15000,
    },
  }),
})
