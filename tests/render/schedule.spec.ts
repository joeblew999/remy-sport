import { test, expect } from "./fixture"
import { seedCache, entry, orpc } from "../helpers/seed-cache"

/**
 * The schedule, rendered against seeded games.
 *
 * The one decision this component makes is whether to offer score entry, and it
 * makes it from `canEnterScore` — the server's answer, per game. So the tests
 * seed that field rather than a role: seeding a role would assert a rule the
 * component does not contain.
 */

const base = {
  eventId: "evt_002",
  homeTeamNames: { en: "Assumption U16", th: "อัสสัมชัญ U16" },
  awayTeamNames: { en: "Montfort U16", th: "มงฟอร์ต U16" },
  venueNames: { en: "Assumption Indoor Court" },
  canEnterScore: false,
}

const finished = { ...base, id: "gam_001", startsAt: "2026-06-10T10:00:00Z", statusCode: "FINISHED", homeScore: 68, awayScore: 54, venueId: "ven_002" }
const upcoming = { ...base, id: "gam_003", startsAt: "2026-09-15T10:00:00Z", statusCode: "SCHEDULED", homeScore: null, awayScore: null, venueId: null, venueNames: null }

const seed = (page: Parameters<typeof seedCache>[0], games: unknown[]) =>
  seedCache(page, [
    entry(orpc.events.get, { id: "evt_002" }, {
      id: "evt_002", name: "Bangkok Schools League", names: { en: "Bangkok Schools League" },
      typeCode: "LEAGUE", formatCode: "5x5", description: null,
      startDate: "2026-05-01", endDate: "2026-09-30", cityCode: "BANGKOK", provinceCode: "BKK",
      isFibaCertified: false, organizerUserId: "usr_org_002", orgId: null,
      organizerName: "Niran", createdAt: "2026-04-01T00:00:00Z", updatedAt: "2026-04-01T00:00:00Z",
    } as never),
    entry(orpc.games.list, { eventId: "evt_002" }, { games } as never),
  ])

test.describe("An event's schedule", () => {
  test("shows each fixture, its score and its status", async ({ page }) => {
    await seed(page, [finished, upcoming])
    await page.goto("/#/event/evt_002")
    await page.getByRole("button", { name: "Schedule" }).click()

    await expect(page.getByTestId("game-gam_001")).toContainText("Assumption U16")
    await expect(page.getByTestId("score-gam_001")).toHaveText("68–54")
    await expect(page.getByTestId("game-status-gam_001")).toHaveText("Finished")

    // No score yet, and no court assigned — neither is invented.
    await expect(page.getByTestId("score-gam_003")).toHaveText("—")
    await expect(page.getByTestId("game-gam_003")).toContainText("Venue TBC")
  })

  test("offers score entry only where the server says it may", async ({ page }) => {
    await seed(page, [{ ...finished, canEnterScore: true }, upcoming])
    await page.goto("/#/event/evt_002")
    await page.getByRole("button", { name: "Schedule" }).click()

    await expect(page.getByTestId("enter-score-gam_001")).toBeVisible()
    await expect(page.getByTestId("enter-score-gam_003")).toHaveCount(0)
  })

  test("the score form opens with the current score in it", async ({ page }) => {
    await seed(page, [{ ...finished, canEnterScore: true }])
    await page.goto("/#/event/evt_002")
    await page.getByRole("button", { name: "Schedule" }).click()
    await page.getByTestId("enter-score-gam_001").click()

    await expect(page.getByTestId("home-score-gam_001")).toHaveValue("68")
    await expect(page.getByTestId("away-score-gam_001")).toHaveValue("54")
  })

  test("says so when an event has no fixtures, rather than showing an empty table", async ({ page }) => {
    await seed(page, [])
    await page.goto("/#/event/evt_002")
    await page.getByRole("button", { name: "Schedule" }).click()

    await expect(page.getByTestId("schedule-empty")).toBeVisible()
    await expect(page.getByTestId("schedule")).toHaveCount(0)
  })
})
