import { test, expect } from "@playwright/test"
import { stateFor, COACH } from "../helpers/auth"

test("a visitor can filter, open a game and return to the same competition on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/#/event/evt_002")
  await page.getByTestId("event-division").selectOption("div_001")
  await page.getByTestId("tab-standings").click()
  await expect(page.getByRole("heading", { name: "U16 Boys", exact: true })).toBeVisible()
  await expect(page.getByRole("heading", { name: "U18 Girls", exact: true })).toHaveCount(0)
  await page.reload()
  await expect(page.getByTestId("event-division")).toHaveValue("div_001")
  await page.getByTestId("tab-games").click()
  await page.getByTestId("open-game-gam_002").click()
  // The game records the event tab it was opened from (docs/2026-09-09-09).
  await expect(page).toHaveURL(/#\/game\/gam_002\?from=%2Fevent%2F/)
  await expect(page.getByTestId("game-gam_002")).toBeVisible()
  await expect(page.getByTestId("enter-score-gam_002")).toHaveCount(0)
  // The spoiler switch lives in the sidebar's Settings group (B2 step 8); on a
  // phone that is a Sheet, so the reader opens it the way they always have.
  await page.getByTestId("menu-btn").click()
  await page.getByRole("switch", { name: "Spoiler mode" }).click()
  await expect(page.getByTestId("score-gam_002")).toContainText("hidden")
  await page.goBack()
  await expect(page.getByTestId("event-division")).toHaveValue("div_001")
  expect(await page.locator("body").evaluate(el => el.scrollWidth <= innerWidth)).toBe(true)
})

test.describe("Connected signed-in journeys", () => {
  test.use({ storageState: stateFor(COACH) })
  test("game → team → player and back; team tab is a real URL", async ({ page }) => {
    await page.goto("/#/game/gam_002")
    await page.getByTestId("game-team-links").locator('a[href^="#/team/team_001?"]').click()
    await page.getByTestId("tab-schedule").click()
    await page.getByTestId("tab-roster").click()
    // Tab selection preserves the trail back to the game.
    await expect(page).toHaveURL(/#\/team\/team_001\?.*tab=roster/)
    const player = page.locator('[data-testid^="open-player-"]').first()
    await player.focus()
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL(/#\/player\/ply_/)
    await expect(page.locator("h1")).toBeVisible()
    await page.goBack()
    await expect(page.getByTestId("roster")).toBeVisible()
  })
})

test.describe("A referee's game detail", () => {
  test.use({ storageState: stateFor("adisorn.b@bat.test") })
  test("an assignment opens its scoring controls before choosing an action", async ({ page }) => {
    await page.goto("/#/game/gam_002")
    await expect(page.getByTestId("enter-score-gam_002")).toBeVisible()
    await page.getByTestId("enter-score-gam_002").click()
    await expect(page.getByTestId("score-form-gam_002")).toBeVisible()
  })
})
