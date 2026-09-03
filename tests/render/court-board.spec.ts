import { test, expect } from "./fixture"
import { asVisitor } from "../helpers/actors"
import { visit } from "../helpers/surfaces"
import { seedCache, entry, orpc } from "../helpers/seed-cache"
import { apiEvent, apiGame } from "../helpers/api-fixtures"

/**
 * The board somebody standing in a sports hall reads.
 *
 * `VIEW_COURT_STATUS_BOARD` and `VIEW_COURT_ASSIGNMENTS` are granted to PUBLIC
 * and had no screen — two of the twenty-eight actions the model describes and
 * the app did not offer. Nothing new was needed to build it: `games.list`
 * already returns each game's venue and status, and `ASSIGN_COURTS` has been
 * writing the assignment all along with nowhere to read it.
 *
 * Signed out on purpose. The model says PUBLIC, and a parent in the hall
 * checking which court their child is on is not going to sign in first.
 */

const EVENT = "evt_001"
const COURT_A = "ven_001"
const COURT_B = "ven_002"

const game = (over: Partial<Parameters<typeof apiGame>[0]>) => apiGame(over)

/** Signed out — `asVisitor` seeds the resolved-and-empty session separately. */
const seed = (page: Parameters<typeof seedCache>[0], games: ReturnType<typeof game>[]) =>
  seedCache(page, [
    entry(orpc.events.get, { id: EVENT }, apiEvent({ id: EVENT })),
    entry(orpc.games.list, { eventId: EVENT }, { games, viewerTimezone: "Asia/Bangkok" }),
  ])

test.describe("The court board", () => {
  test("a court with a game in play shows the score", async ({ page }) => {
    await asVisitor(page)
    await seed(page, [
      game({
        id: "g1",
        venueId: COURT_A,
        venueNames: { en: "Court A" },
        statusCode: "LIVE",
        homeScore: 42,
        awayScore: 38,
      }),
    ])
    await visit(page, "event", { id: EVENT })
    await page.getByTestId("tab-courts").click()

    await expect(page.getByTestId(`court-${COURT_A}-live`)).toContainText("42")
    await expect(page.getByTestId(`court-${COURT_A}-live`)).toContainText("38")
  })

  test("a court with nothing on it says free, rather than showing an empty cell", async ({ page }) => {
    await asVisitor(page)
    await seed(page, [
      // Played and finished, so this court is between games.
      game({ id: "g1", venueId: COURT_B, venueNames: { en: "Court B" }, statusCode: "FINISHED" }),
    ])
    await visit(page, "event", { id: EVENT })
    await page.getByTestId("tab-courts").click()

    // An empty cell reads as a page that failed to load. "Free" is information.
    await expect(page.getByTestId(`court-${COURT_B}-free`)).toBeVisible()
  })

  test("a scheduled game shows as what is next on that court", async ({ page }) => {
    await asVisitor(page)
    await seed(page, [
      game({ id: "g1", venueId: COURT_A, venueNames: { en: "Court A" }, statusCode: "SCHEDULED" }),
    ])
    await visit(page, "event", { id: EVENT })
    await page.getByTestId("tab-courts").click()

    await expect(page.getByTestId(`court-${COURT_A}-next`)).toBeVisible()
  })

  test("an event with no courts assigned says so", async ({ page }) => {
    await asVisitor(page)
    // A game with no venue is left out deliberately: this board answers "what is
    // happening on court 2", and a game with no court is not happening anywhere.
    await seed(page, [game({ id: "g1", venueId: null, venueNames: null })])
    await visit(page, "event", { id: EVENT })
    await page.getByTestId("tab-courts").click()

    await expect(page.getByTestId("court-board-none")).toBeVisible()
  })
})
