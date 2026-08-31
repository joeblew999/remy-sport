import { test, expect } from "./fixture"
import { seedCache, entry, orpc } from "../helpers/seed-cache"
import { apiEntries, apiEvent } from "../helpers/api-fixtures"

/**
 * Which divisions an event runs.
 *
 * The tab exists because `MANAGE_DIVISIONS` had nowhere to attach: a division
 * is a global classification, and which of them an event runs was inferred from
 * whoever had registered. So an organiser could not declare them before
 * registration opened, and the registration form offered every division on the
 * platform.
 */

const DIVISIONS = {
  items: [
    { id: "div_001", names: { en: "U16 Boys" }, ageGroupCode: "U16", genderCode: "M", skillTierCode: null },
    { id: "div_004", names: { en: "U18 Girls" }, ageGroupCode: "U18", genderCode: "F", skillTierCode: null },
    { id: "div_006", names: { en: "Open" }, ageGroupCode: "OPEN", genderCode: "M", skillTierCode: null },
  ],
}

const seed = (
  page: Parameters<typeof seedCache>[0],
  opts: { canEdit: boolean; running: string[]; occupied?: string[] },
) =>
  seedCache(page, [
    entry(orpc.events.get, { id: "evt_002" }, apiEvent({
      id: "evt_002",
      name: "League",
      names: { en: "League" },
      typeCode: "LEAGUE",
      canEdit: opts.canEdit,
    })),
    entry(orpc.divisions.list, undefined, DIVISIONS as never),
    entry(orpc.events.entries, { eventId: "evt_002" }, apiEntries({
      divisions: DIVISIONS.items.filter((d) => opts.running.includes(d.id)) as never,
      registered: (opts.occupied ?? []).map((divisionId, i) => ({
        teamId: `team_00${i + 1}`,
        team: `Team ${i + 1}`,
        divisionId,
        division: "d",
      })) as never,
    })),
  ])

const open = async (page: Parameters<typeof seedCache>[0]) => {
  await page.goto("/#/event/evt_002")
  await page.getByTestId("tab-divisions").click()
}

test.describe("An event's divisions", () => {
  test("ticks the ones it runs and leaves the rest clear", async ({ page }) => {
    await seed(page, { canEdit: true, running: ["div_001", "div_004"] })
    await open(page)

    await expect(page.getByTestId("division-check-div_001")).toBeChecked()
    await expect(page.getByTestId("division-check-div_004")).toBeChecked()
    await expect(page.getByTestId("division-check-div_006")).not.toBeChecked()
  })

  test("will not let one with teams in it be unticked", async ({ page }) => {
    // Dropping it would orphan their entries and silently unregister them. The
    // API refuses; disabling the box makes the refusal visible before the click
    // rather than after it.
    await seed(page, { canEdit: true, running: ["div_001", "div_004"], occupied: ["div_001"] })
    await open(page)

    await expect(page.getByTestId("division-check-div_001")).toBeDisabled()
    await expect(page.getByTestId("division-check-div_004")).toBeEnabled()
  })

  test("is read-only for somebody who may not edit the event", async ({ page }) => {
    // The server's answer, not a role check here.
    await seed(page, { canEdit: false, running: ["div_001"] })
    await open(page)

    await expect(page.getByTestId("division-check-div_001")).toBeDisabled()
    await expect(page.getByTestId("divisions-save")).toHaveCount(0)
  })

  test("sends the whole set, so removing one is expressible", async ({ page }) => {
    await seed(page, { canEdit: true, running: ["div_001"] })

    let sent = ""
    await page.route("**/rpc/**", async (route) => {
      if (!route.request().url().includes("setDivisions")) return route.fallback()
      sent = route.request().postData() ?? ""
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" })
    })

    await open(page)
    await page.getByTestId("division-check-div_006").check()
    await page.getByTestId("divisions-save").click()

    await expect.poll(() => sent).toContain("div_006")
    expect(sent, "the set, not a delta").toContain("div_001")
  })

  test("is not offered on a camp, which has sessions rather than divisions", async ({ page }) => {
    // MANAGE_DIVISIONS is TOURNAMENT, LEAGUE and SHOWCASE. A camp has
    // DEFINE_SESSION_SCHEDULE, which is a different shape entirely.
    await seedCache(page, [
      entry(orpc.events.get, { id: "evt_003" }, apiEvent({
        id: "evt_003",
        name: "Camp",
        names: { en: "Camp" },
        typeCode: "CAMP",
        canEdit: true,
      })),
    ])
    await page.goto("/#/event/evt_003")
    await expect(page.getByTestId("tab-divisions")).toHaveCount(0)
  })
})
