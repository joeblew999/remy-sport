import { test, expect } from "./fixture"
import { seedCache, entry, orpc } from "../helpers/seed-cache"
import { apiEvent, apiReference } from "../helpers/api-fixtures"
import { VOCABULARY as REF } from "../../src/domain/vocabularies"

/**
 * Where an event is, which the app could not say.
 *
 * `provinceCode` has been on every event, org, team and venue since the
 * fixtures were written, the model ships all 77 Thai provinces, and no screen
 * read any of it. Five cities were the whole of the app's geography, so an
 * event in Udon Thani was filterable only as "not one of the five".
 *
 * These run against the real vocabulary — `VOCABULARY` is the compiled model —
 * so the province labels here are the Product Owner's, not fixtures written to
 * match the assertions.
 */

const bangkok = apiEvent({
  id: "e_bkk",
  name: "Bangkok Invitational",
  names: { en: "Bangkok Invitational" },
  cityCode: "BANGKOK",
  provinceCode: "BKK",
})

const chiangMai = apiEvent({
  id: "e_cmi",
  name: "Northern Classic",
  names: { en: "Northern Classic" },
  cityCode: "CHIANG_MAI",
  provinceCode: "CMI",
})

/** A second event in Bangkok, so the filter's count has something to count. */
const alsoBangkok = apiEvent({
  id: "e_bkk2",
  name: "Riverside Cup",
  names: { en: "Riverside Cup" },
  cityCode: "BANGKOK",
  provinceCode: "BKK",
})

const seeded = (page: Parameters<typeof seedCache>[0], events = [bangkok, chiangMai, alsoBangkok]) =>
  seedCache(page, [
    entry(orpc.events.list, undefined, { events, canCreate: false }),
    entry(orpc.reference.list, undefined, apiReference(REF)),
  ])

test.describe("Filtering events by province", () => {
  test("offers only provinces that have an event, with how many", async ({ page }) => {
    await seeded(page)
    await page.goto("/")

    const filter = page.getByTestId("province-filter")
    await expect(filter).toBeVisible()

    // Two provinces among three events — not seventy-seven. Offering a reader
    // seventy-four choices that return nothing is worse than offering none.
    const options = filter.locator("option")
    await expect(options).toHaveCount(3) // "All provinces" + the two

    // The count is on the option, so a filter that can empty the page says so
    // before it is clicked.
    await expect(options.nth(1)).toContainText("(")
    await expect(filter).toContainText("Bangkok")
    await expect(filter).toContainText("Chiang Mai")
  })

  test("selecting one narrows the list to that province", async ({ page }) => {
    await seeded(page)
    await page.goto("/")
    await expect(page.locator(".event-row")).toHaveCount(3)

    await page.getByTestId("province-filter").selectOption("CMI")
    await expect(page.locator(".event-row")).toHaveCount(1)
    await expect(page.locator(".event-row")).toContainText("Northern Classic")

    // And back, so the test cannot pass by filtering everything away.
    await page.getByTestId("province-filter").selectOption("")
    await expect(page.locator(".event-row")).toHaveCount(3)
  })

  /**
   * The filters live in the address bar, and this is why.
   *
   * main.tsx renders `<App key={locale}>` so a language switch re-evaluates
   * Paraglide's messages, which are plain functions nothing subscribes to.
   * Keying remounts the tree, and a remount resets every `useState` in it — so
   * choosing a province and then switching to Thai silently cleared the filter
   * and put every event back on the page, with the control still showing the
   * selection. It applied to the type chips, the city chips and the tab too.
   */
  test("survives a language switch, which used to silently clear it", async ({ page }) => {
    await seeded(page)
    await page.goto("/")
    await page.getByTestId("province-filter").selectOption("CMI")
    await expect(page.locator(".event-row")).toHaveCount(1)

    await page.locator(".lang-switch button", { hasText: "TH" }).click()
    await expect(page.locator(".event-row")).toHaveCount(1)
    // And the control still agrees with the list, which is the half that made
    // the old bug hard to see.
    await expect(page.getByTestId("province-filter")).toHaveValue("CMI")
  })

  test("is a link somebody can send", async ({ page }) => {
    await seeded(page)
    await page.goto("/#/?province=CMI")
    await expect(page.locator(".event-row")).toHaveCount(1)
    await expect(page.locator(".event-row")).toContainText("Northern Classic")
  })

  test("the tab and the chips go in the address bar too", async ({ page }) => {
    await seeded(page)
    await page.goto("/")
    await page.getByTestId("province-filter").selectOption("BKK")
    await expect(page).toHaveURL(/province=BKK/)

    // Clearing it leaves no trace, so a shared link carries only what is set.
    await page.getByTestId("province-filter").selectOption("")
    await expect(page).not.toHaveURL(/province=/)
  })

  test("hides itself when there is nothing to choose between", async ({ page }) => {
    // One province is not a filter. A select with a single real option is a
    // control that cannot change what the reader sees.
    await seeded(page, [bangkok, alsoBangkok])
    await page.goto("/")
    await expect(page.getByTestId("province-filter")).toHaveCount(0)
  })

  test("shows the province on the event row, beside the city", async ({ page }) => {
    await seeded(page)
    await page.goto("/")
    const row = page.locator(".event-row").filter({ hasText: "Northern Classic" })
    await expect(row.locator(".city")).toContainText("Chiang Mai")
  })
})
