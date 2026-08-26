import { test, expect } from "@playwright/test"

// ADR 008 step 2. Teams are the second resource to leave src/web/data.ts for
// D1; before this the team page was entirely hardcoded and did not even read
// the id from its own route.

test.describe("Teams API", () => {
  test("a deep-link to a missing team says so", async ({ page }) => {
    await page.goto("/#/team/team_does_not_exist")
    await expect(page.locator(".empty")).toContainText("does not exist")
  })

    test("fixture-backed sections are labelled as sample data", async ({ page }) => {
    await page.goto("/#/team/team_002")
    // Roster and schedule still come from src/web/data.ts. Sitting under a real
    // team, they need to say so.
    await expect(page.locator(".section-h", { hasText: "Roster" })).toContainText("SAMPLE DATA")
  })
})
