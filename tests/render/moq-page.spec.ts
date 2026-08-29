import { test, expect } from "./fixture"
import { seedCache, entry, orpc } from "../helpers/seed-cache"

/**
 * The video pages with no relay configured — which is the majority path.
 *
 * The ordinary `page` fixture, so there is no WebTransport and no relay token:
 * exactly what a visitor gets today. What matters is that they see a sentence
 * rather than a blank screen or a thrown error, because "the page is broken" and
 * "video is not switched on here" look identical to somebody standing in a gym.
 */

test.describe("Live video, before a relay exists", () => {
  test("the broadcast page says video is not switched on, rather than failing", async ({
    page,
  }) => {
    const errors: string[] = []
    page.on("pageerror", (e) => errors.push(e.message))

    await page.goto("/#/broadcast/gam_002")

    await expect(page.getByTestId("moq-unconfigured")).toBeVisible()
    await expect(page.getByTestId("moq-publish")).toHaveCount(0)
    expect(errors, "an unconfigured relay must not throw").toEqual([])
  })

  test("and so does the watch page", async ({ page }) => {
    await page.goto("/#/watch/gam_002")
    await expect(page.getByTestId("moq-unconfigured")).toBeVisible()
    await expect(page.getByTestId("moq-watch")).toHaveCount(0)
  })

  test("names the game, so a broadcaster can see they picked the right one", async ({ page }) => {
    // Pointing a camera at the wrong fixture is the mistake this prevents, and
    // the id in the URL is not something a person can check at a glance.
    await seedCache(page, [
      entry(orpc.games.get, { id: "gam_002" }, {
        id: "gam_002",
        eventId: "evt_002",
        homeTeamId: "team_001",
        awayTeamId: "team_003",
        homeTeamNames: { en: "Assumption U16" },
        awayTeamNames: { en: "Montfort U16" },
        venueId: "ven_001",
        venueNames: { en: "Assumption Indoor Court" },
        startsAt: "2026-08-27T13:00:00Z",
        statusCode: "LIVE",
        homeScore: 41,
        awayScore: 38,
        timezone: "Asia/Bangkok",
        canEnterScore: false,
        canSetStatus: false,
        canAssignReferee: false,
        referees: [],
        availableReferees: [],
      } as never),
    ])
    await page.goto("/#/broadcast/gam_002")

    const heading = page.getByTestId("video-game")
    await expect(heading).toBeVisible()
    await expect(heading).toContainText("Assumption U16")
    await expect(heading).toContainText("Montfort U16")
  })

  test("says so when no game was named at all", async ({ page }) => {
    await page.goto("/#/broadcast")
    await expect(page.getByTestId("video-no-game")).toBeVisible()
  })
})
