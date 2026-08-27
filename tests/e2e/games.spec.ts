import { test, expect } from "@playwright/test"
import { stateFor, actor, COACH } from "../helpers/auth"

/**
 * Entering a score through the browser, against a real Worker.
 *
 * The round trip the render tier cannot make: whether the score control appears
 * is `canEnterScore`, and that is a relation resolved against `game_referees` and
 * the game's event. Only the database can answer it.
 *
 * Adisorn is the referee on gam_002. Serial, and it restores the score it found,
 * because the seed's games are shared state.
 */

const ADISORN = "adisorn.b@bat.test"
const WARAPORN = "waraporn.j@bat.test"

test.describe.serial("Scoring a game", () => {
  test.describe("as the assigned referee", () => {
    test.use({ storageState: stateFor(ADISORN) })

    test("the score control appears, and the score round-trips", async ({ page }) => {
      await page.goto("/#/event/evt_002")
      await page.getByRole("button", { name: "Schedule" }).click()
      await expect(page.getByTestId("game-gam_002")).toBeVisible()

      await page.getByTestId("enter-score-gam_002").click()
      await page.getByTestId("home-score-gam_002").fill("77")
      await page.getByTestId("away-score-gam_002").fill("70")
      await page.getByTestId("save-score-gam_002").click()

      // Invalidation, not a reload.
      await expect(page.getByTestId("score-gam_002")).toHaveText("77–70")
      await page.reload()
      await page.getByRole("button", { name: "Schedule" }).click()
      await expect(page.getByTestId("score-gam_002")).toHaveText("77–70")

      // Put it back the way the seed had it.
      await page.getByTestId("enter-score-gam_002").click()
      await page.getByTestId("home-score-gam_002").fill("41")
      await page.getByTestId("away-score-gam_002").fill("38")
      await page.getByTestId("save-score-gam_002").click()
      await expect(page.getByTestId("score-gam_002")).toHaveText("41–38")
    })
  })

  test.describe("as a referee on a different game", () => {
    test.use({ storageState: stateFor(WARAPORN) })

    test("sees the fixture but is offered no way to score it", async ({ page }) => {
      await page.goto("/#/event/evt_002")
      await page.getByRole("button", { name: "Schedule" }).click()

      // The schedule is public — reading a score never required an account.
      await expect(page.getByTestId("game-gam_002")).toBeVisible()
      await expect(page.getByTestId("score-gam_002")).toHaveText("41–38")
      // Assigned to gam_003, not this one.
      await expect(page.getByTestId("enter-score-gam_002")).toHaveCount(0)
      await expect(page.getByTestId("enter-score-gam_003")).toBeVisible()
    })
  })

  test.describe("as a coach with no part in the event", () => {
    test.use({ storageState: stateFor(COACH) })

    test("can read the schedule and score nothing", async ({ page }) => {
      await page.goto("/#/event/evt_002")
      await page.getByRole("button", { name: "Schedule" }).click()
      await expect(page.getByTestId("schedule")).toBeVisible()
      await expect(page.getByTestId("enter-score-gam_002")).toHaveCount(0)
      await expect(page.getByTestId("enter-score-gam_003")).toHaveCount(0)
    })
  })
})
