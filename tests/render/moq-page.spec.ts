import { test, expect } from "./fixture"
import { visit } from "../helpers/surfaces"
import { seedCache, entry, orpc } from "../helpers/seed-cache"
import { type ApiGame } from "../helpers/api-fixtures"
import { granted, projectEvent, projectGame, projectGamesIn } from "../helpers/projections"

/**
 * The video pages with no relay configured — which is the majority path.
 *
 * The ordinary `page` fixture, so there is no WebTransport and no relay token:
 * exactly what a visitor gets today. What matters is that they see a sentence
 * rather than a blank screen or a thrown error, because "the page is broken" and
 * "video is not switched on here" look identical to somebody standing in a gym.
 */

/**
 * gam_002, the league's live game, off the seed.
 *
 * This was a literal naming teams "Assumption U16" and "Montfort U16", which is
 * not what either row holds, at a venue whose name it also invented. It is the
 * real fixture now — and gam_002 genuinely is LIVE, which is what this file is
 * about.
 */
const liveGame: ApiGame = projectGame("gam_002")

/** The referee assigned to a league game may broadcast it. */
const referee = granted("GAME", ["GAME_REFEREE"], "LEAGUE")

/**
 * The native notification path must be invisible in a browser.
 *
 * Adding it put a `pushState()` call at the app root, which fetches the VAPID
 * key — a round trip on every page for an answer no browser needs, and an
 * unhandled rejection where there is no Worker. Nothing asserted that directly;
 * it surfaced as an unrelated "an unconfigured relay must not throw" three
 * files away, which is a bad way to find out.
 */
test.describe("The native notification path stays out of the browser's way", () => {
  test("no page in a browser makes an unhandled request for the push key", async ({ page }) => {
    const errors: string[] = []
    const keyCalls: string[] = []
    page.on("pageerror", (e) => errors.push(e.message))
    page.on("request", (r) => {
      if (/push\/key|notifications\/key/.test(r.url())) keyCalls.push(r.url())
    })

    // A page that does not render notification settings. The root-level effect
    // ran here regardless, which was the bug.
    await visit(page, "broadcast", { id: "gam_002" })
    await page.waitForTimeout(800)

    expect(errors, "the app root must not reject unhandled").toEqual([])
    expect(keyCalls, "a browser has no use for the native state").toEqual([])
  })
})

test.describe("Live video, before a relay exists", () => {
  test.beforeEach(async ({ page }) => {
    // No configured relay is a successful empty response, not an HTTP failure.
    await page.route('**/rpc/moq/config**', (route) => route.fulfill({
      json: { json: { url: null, token: null } },
    }))
  })
  test("the broadcast page says video is not switched on, rather than failing", async ({
    page,
  }) => {
    const errors: string[] = []
    page.on("pageerror", (e) => errors.push(e.message))

    await visit(page, "broadcast", { id: "gam_002" })

    await expect(page.getByTestId("moq-unconfigured")).toBeVisible()
    await expect(page.getByTestId("moq-publish")).toHaveCount(0)
    expect(errors, "an unconfigured relay must not throw").toEqual([])
  })

  test("and so does the watch page", async ({ page }) => {
    await visit(page, "watch", { id: "gam_002" })
    await expect(page.getByTestId("moq-unconfigured")).toBeVisible()
    await expect(page.getByTestId("moq-watch")).toHaveCount(0)
  })

  test("names the game, so a broadcaster can see they picked the right one", async ({ page }) => {
    // Pointing a camera at the wrong fixture is the mistake this prevents, and
    // the id in the URL is not something a person can check at a glance.
    await seedCache(page, [
      entry(orpc.games.get, { id: "gam_002" }, liveGame),
    ])
    await visit(page, "broadcast", { id: "gam_002" })

    const heading = page.getByTestId("video-game")
    await expect(heading).toBeVisible()
    await expect(heading).toContainText(liveGame.homeTeamNames.en!)
    await expect(heading).toContainText(liveGame.awayTeamNames.en!)
  })

  test("falls back to the game being played, so the menu entry works on its own", async ({
    page,
  }) => {
    // The sidebar links to a page, not to a fixture, and somebody in another
    // country trying this out should not have to find a game id first.
    await seedCache(page, [
      entry(orpc.games.list, {}, { viewerTimezone: null, games: [liveGame] }),
      entry(orpc.games.get, { id: "gam_002" }, liveGame),
    ])
    await visit(page, "broadcast")
    await expect(page.getByTestId("video-game")).toContainText(liveGame.homeTeamNames.en!)
  })

  test("says so when there is no game at all to fall back to", async ({ page }) => {
    await seedCache(page, [
      entry(orpc.games.list, {}, { viewerTimezone: null, games: [] }),
    ])
    await visit(page, "broadcast")
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
const liveGameRow = (over: Partial<ApiGame>) => ({ ...liveGame, ...over })

/** A fixture in the same league that has not been played yet. */
const scheduled = projectGamesIn("evt_002").find((g) => g.statusCode === "SCHEDULED")!

test.describe("Finding a game to watch", () => {
  test("offers Watch only on a game somebody is broadcasting", async ({ page }) => {
    await seedCache(page, [
      entry(orpc.games.list, {}, {
        viewerTimezone: null,
        games: [
          liveGameRow({ id: "gam_002", isBroadcasting: true }),
          liveGameRow({ id: "gam_014", isBroadcasting: false }),
        ],
      }),
    ])
    await visit(page, "live")

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
          liveGameRow({ id: "gam_002", can: referee }),
          liveGameRow({ id: "gam_014" }),
        ],
      }),
    ])
    await visit(page, "live")

    await expect(page.getByTestId("broadcast-gam_002")).toBeVisible()
    await expect(page.getByTestId("broadcast-gam_014")).toHaveCount(0)
  })

  test("says so when nothing is being played, rather than showing an empty box", async ({
    page,
  }) => {
    await seedCache(page, [
      entry(orpc.games.list, {}, { viewerTimezone: null, games: [] }),
    ])
    await visit(page, "live")
    await expect(page.getByTestId("no-live-games")).toBeVisible()
  })

  test("keeps Watch and Broadcast out of the sidebar", async ({ page }) => {
    // Video belongs to a game. "Watch" with no game is a question the nav
    // cannot answer, and when it was there it guessed — sending two devices to
    // whatever each thought was the current game.
    await visit(page, "live")
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
      entry(orpc.events.get, { id: "evt_002" }, projectEvent("evt_002")),
      entry(orpc.games.list, { eventId: "evt_002" }, {
        viewerTimezone: null,
        games: [
          // A real scheduled fixture in this league, not an invented id: a
          // referee arriving before tip-off is looking at a game that exists.
          { ...scheduled, isBroadcasting: false, can: referee },
        ],
      }),
    ])
    await visit(page, "event", { id: "evt_002" })
    await page.getByRole("button", { name: "Schedule" }).click()
    await expect(page.getByTestId(`broadcast-fixture-${scheduled.id}`)).toBeVisible()
  })

  test("shows Watch on a fixture somebody is filming, to anyone reading the schedule", async ({
    page,
  }) => {
    await seedCache(page, [
      entry(orpc.events.get, { id: "evt_002" }, projectEvent("evt_002")),
      entry(orpc.games.list, { eventId: "evt_002" }, {
        viewerTimezone: null,
        games: [{ ...liveGame, isBroadcasting: true }],
      }),
    ])
    await visit(page, "event", { id: "evt_002" })
    await page.getByRole("button", { name: "Schedule" }).click()
    // Nobody should have to know a second page exists to find the picture.
    await expect(page.getByTestId(`watch-fixture-${liveGame.id}`)).toBeVisible()
  })
})
