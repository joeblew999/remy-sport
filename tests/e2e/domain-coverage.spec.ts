import { test, expect } from "@playwright/test"
import { actor, stateFor } from "../helpers/auth"

test.describe("existing-model editing journeys", () => {
  test.use({ storageState: stateFor(actor("ORGANIZER", 1)) })

  test("create from Discover, edit translations and dates, then read after reload", async ({ page }) => {
    await page.goto("/#/discover")
    await page.getByTestId("discover-create-event").locator("summary").click()
    const form = page.getByTestId("create-event-form")
    await form.getByRole("textbox", { name: "Name", exact: true }).fill("Domain coverage journey")
    await page.getByTestId("create-event-type").selectOption("LEAGUE")
    await form.getByRole("button", { name: "Create event", exact: true }).click()
    await expect(page).toHaveURL(/#\/event\//)
    const id = new URL(page.url()).hash.split("/").at(-1)!
    try {
      await page.getByTestId("tab-settings").click()
      await page.locator("#event-name-ja").fill("保存された大会")
      await page.getByLabel("Description", { exact: true }).fill("Bring indoor shoes")
      await page.getByTestId("event-start-input").fill("2026-09-10")
      await page.getByTestId("event-end-input").fill("2026-09-20")
      await page.getByTestId("event-save").click()
      await expect(page.getByTestId("event-saved")).toBeVisible()
      await page.reload()
      await page.getByTestId("tab-settings").click()
      await expect(page.locator("#event-name-ja")).toHaveValue("保存された大会")
      await expect(page.getByLabel("Description", { exact: true })).toHaveValue("Bring indoor shoes")
      await expect(page.getByTestId("event-start-input")).toHaveValue("2026-09-10")
      await page.getByTestId("event-start-input").fill("")
      await page.getByTestId("event-end-input").fill("")
      await page.getByTestId("event-save").click()
      await expect(page.getByTestId("event-saved")).toBeVisible()
      await page.reload()
      await page.getByTestId("tab-settings").click()
      await expect(page.getByTestId("event-start-input")).toHaveValue("")
      await expect(page.getByTestId("event-end-input")).toHaveValue("")
    } finally {
      expect((await page.request.delete(`/api/events/${id}`)).ok()).toBe(true)
    }
  })
})

test.describe("player box scores", () => {
  test.use({ storageState: stateFor("adisorn.b@bat.test") })

  test("the assigned scorer saves zero and a missing count across reload", async ({ page }) => {
    const response = await page.request.get("/api/games/gam_002/stats")
    expect(response.ok()).toBe(true)
    const { players } = await response.json()
    const original = players[0]
    const path = `/api/games/gam_002/stats/${original.playerId}`
    try {
      await page.goto("/#/event/evt_002")
      await page.getByTestId("tab-schedule").click()
      await page.getByTestId("box-score-gam_002").click()
      const line = page.getByTestId(`stat-line-${original.playerId}`)
      await line.locator('[name="points"]').fill("0")
      await line.locator('[name="assists"]').fill("")
      await line.getByRole("button", { name: "Save", exact: true }).click()
      await expect(line.getByRole("status")).toBeVisible()
      await page.reload()
      await page.getByTestId("tab-schedule").click()
      await page.getByTestId("box-score-gam_002").click()
      await expect(line.locator('[name="points"]')).toHaveValue("0")
      await expect(line.locator('[name="assists"]')).toHaveValue("")
    } finally {
      const { points, rebounds, assists, fouls } = original
      expect((await page.request.put(path, { data: { points, rebounds, assists, fouls } })).ok()).toBe(true)
    }
  })
})

test.describe("current squad coach editing", () => {
  test.use({ storageState: stateFor(actor("COACH", 0)) })
  test("the coach edits a squad member from the player page and reloads", async ({ page }) => {
    const original = await (await page.request.get('/api/players/ply_001')).json()
    try {
      await page.goto('/#/player/ply_001')
      await page.getByTestId('edit-player-ply_001').click()
      await page.getByTestId('player-number-ply_001').fill('19')
      const saved = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/rpc/players/update') && response.request().method() === 'POST')
      await page.getByTestId('player-save-ply_001').click()
      const response = await saved
      expect(response.ok(), await response.text()).toBe(true)
      await expect(page.getByTestId('player-form-ply_001')).toHaveCount(0)
      await expect(page.getByTestId('player-meta')).toContainText('#19')
      await page.reload()
      await expect(page.getByTestId('player-meta')).toContainText('#19')
    } finally {
      expect((await page.request.put('/api/players/ply_001', { data: { jerseyNumber: original.jerseyNumber } })).ok()).toBe(true)
    }
  })
})
