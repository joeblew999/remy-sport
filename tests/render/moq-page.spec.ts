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

const liveGame: Record<string, unknown> = {
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
}

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
      entry(orpc.games.get, { id: "gam_002" }, liveGame as never),
    ])
    await page.goto("/#/broadcast/gam_002")

    const heading = page.getByTestId("video-game")
    await expect(heading).toBeVisible()
    await expect(heading).toContainText("Assumption U16")
    await expect(heading).toContainText("Montfort U16")
  })

  test("falls back to the game being played, so the menu entry works on its own", async ({
    page,
  }) => {
    // The sidebar links to a page, not to a fixture, and somebody in another
    // country trying this out should not have to find a game id first.
    await seedCache(page, [
      entry(orpc.games.list, {}, { viewerTimezone: null, games: [liveGame] } as never),
      entry(orpc.games.get, { id: "gam_002" }, liveGame as never),
    ])
    await page.goto("/#/broadcast")
    await expect(page.getByTestId("video-game")).toContainText("Assumption U16")
  })

  test("says so when there is no game at all to fall back to", async ({ page }) => {
    await seedCache(page, [
      entry(orpc.games.list, {}, { viewerTimezone: null, games: [] } as never),
    ])
    await page.goto("/#/broadcast")
    await expect(page.getByTestId("video-no-game")).toBeVisible()
  })
})

/**
 * Where a person actually finds a game to watch.
 *
 * The Live page is the discovery path, and it has to be: Cloudflare's relay
 * does not support broadcast discovery, so nothing can ask it what is being
 * published. A Watch button therefore appears only where our own data says a
 * camera is pointed at that game.
 */
const liveGameRow = (over: Record<string, unknown>) => ({
  ...liveGame,
  isBroadcasting: false,
  canBroadcast: false,
  ...over,
})

test.describe("Finding a game to watch", () => {
  test("offers Watch only on a game somebody is broadcasting", async ({ page }) => {
    await seedCache(page, [
      entry(orpc.games.list, {}, {
        viewerTimezone: null,
        games: [
          liveGameRow({ id: "gam_002", isBroadcasting: true }),
          liveGameRow({ id: "gam_014", isBroadcasting: false }),
        ],
      } as never),
    ])
    await page.goto("/#/live")

    await expect(page.getByTestId("watch-gam_002")).toBeVisible()
    // A Watch link on a game nobody is broadcasting is a link to a black
    // rectangle, which is how a feature earns a reputation.
    await expect(page.getByTestId("watch-gam_014")).toHaveCount(0)
  })

  test("offers Broadcast only to somebody the model permits", async ({ page }) => {
    await seedCache(page, [
      entry(orpc.games.list, {}, {
        viewerTimezone: null,
        games: [
          liveGameRow({ id: "gam_002", canBroadcast: true }),
          liveGameRow({ id: "gam_014", canBroadcast: false }),
        ],
      } as never),
    ])
    await page.goto("/#/live")

    await expect(page.getByTestId("broadcast-gam_002")).toBeVisible()
    await expect(page.getByTestId("broadcast-gam_014")).toHaveCount(0)
  })

  test("says so when nothing is being played, rather than showing an empty box", async ({
    page,
  }) => {
    await seedCache(page, [
      entry(orpc.games.list, {}, { viewerTimezone: null, games: [] } as never),
    ])
    await page.goto("/#/live")
    await expect(page.getByTestId("no-live-games")).toBeVisible()
  })

  test("keeps Watch and Broadcast out of the sidebar", async ({ page }) => {
    // Video belongs to a game. "Watch" with no game is a question the nav
    // cannot answer, and when it was there it guessed — sending two devices to
    // whatever each thought was the current game.
    await page.goto("/#/live")
    const nav = page.locator(".sidebar .nav-item")
    await expect(nav.filter({ hasText: "Watch" })).toHaveCount(0)
    await expect(nav.filter({ hasText: "Broadcast" })).toHaveCount(0)
    await expect(nav.filter({ hasText: "Live now" })).toBeVisible()
  })
})

test.describe("A broadcaster starts from the fixture they are standing at", () => {
  test("offers Broadcast on a scheduled game, before it is live", async ({ page }) => {
    // The moment that matters: a referee arrives before tip-off, when the game
    // is still SCHEDULED. Offering this only on Live now — which lists games
    // already in play — is offering it after they needed it.
    await seedCache(page, [
      entry(orpc.events.get, { id: "evt_002" }, {
        id: "evt_002", name: "Bangkok Schools League", names: { en: "Bangkok Schools League" },
        typeCode: "LEAGUE", formatCode: "5x5", description: null,
        startDate: "2026-05-01", endDate: "2026-09-30", cityCode: "BANGKOK", provinceCode: "BKK",
        isFibaCertified: false, organizerUserId: "usr_org_002", orgId: null,
        organizerName: "Niran", createdAt: "2026-04-01T00:00:00Z", updatedAt: "2026-04-01T00:00:00Z",
      } as never),
      entry(orpc.games.list, { eventId: "evt_002" }, {
        viewerTimezone: null,
        games: [
          { ...liveGame, id: "gam_050", statusCode: "SCHEDULED", homeScore: null, awayScore: null,
            isBroadcasting: false, canBroadcast: true },
        ],
      } as never),
    ])
    await page.goto("/#/event/evt_002")
    await page.getByRole("button", { name: "Schedule" }).click()
    await expect(page.getByTestId("broadcast-fixture-gam_050")).toBeVisible()
  })

  test("shows Watch on a fixture somebody is filming, to anyone reading the schedule", async ({
    page,
  }) => {
    await seedCache(page, [
      entry(orpc.events.get, { id: "evt_002" }, {
        id: "evt_002", name: "Bangkok Schools League", names: { en: "Bangkok Schools League" },
        typeCode: "LEAGUE", formatCode: "5x5", description: null,
        startDate: "2026-05-01", endDate: "2026-09-30", cityCode: "BANGKOK", provinceCode: "BKK",
        isFibaCertified: false, organizerUserId: "usr_org_002", orgId: null,
        organizerName: "Niran", createdAt: "2026-04-01T00:00:00Z", updatedAt: "2026-04-01T00:00:00Z",
      } as never),
      entry(orpc.games.list, { eventId: "evt_002" }, {
        viewerTimezone: null,
        games: [{ ...liveGame, id: "gam_051", isBroadcasting: true, canBroadcast: false }],
      } as never),
    ])
    await page.goto("/#/event/evt_002")
    await page.getByRole("button", { name: "Schedule" }).click()
    // Nobody should have to know a second page exists to find the picture.
    await expect(page.getByTestId("watch-fixture-gam_051")).toBeVisible()
  })
})
