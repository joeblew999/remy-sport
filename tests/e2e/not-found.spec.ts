import { test, expect } from "@playwright/test"

/**
 * The deep-link assertions that genuinely needs the Worker.
 *
 * "the API said no" is the subject, so there is nothing to seed: the query has
 * to run and 404 for real. Everything else about this page renders from seeded
 * data in tests/team-render.spec.ts, with no backend.
 */
test("a deep-link to a missing team says so, rather than showing another one", async ({ page }) => {
  await page.goto("/#/team/team_does_not_exist")
  await expect(page.locator(".empty")).toContainText("does not exist")
})

test("a deep-link to a missing event says so, rather than showing another one", async ({ page }) => {
  await page.goto("/#/event/evt_does_not_exist")
  await expect(page.locator(".empty")).toContainText("does not exist")
})
