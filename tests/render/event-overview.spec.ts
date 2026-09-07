import { test, expect } from "./fixture"
import { visit } from "../helpers/surfaces"
import { seedCache, entry, orpc } from "../helpers/seed-cache"
import { projectEvent, projectGamesIn } from "../helpers/projections"

/**
 * The event overview, as a visitor reads it on a phone.
 *
 * Two things found by looking on 2026-09-06, neither of which any assertion
 * about text could have caught. The title "Sponsor Thailand Basketball League
 * 2026 — Bangkok Round" rendered as "2026— Bangkok Round": JSX keeps no
 * whitespace between an expression and the element after it. And "Recent
 * results" was four bare lines in a bordered box — two names, two scores,
 * stacked — because the markup's class names had no rule in the stylesheet.
 */

/** The tournament whose name carries a dash, off the seed. */
const EVENT = "evt_001"
const event = projectEvent(EVENT)
const games = projectGamesIn(EVENT)
const finished = games.filter((g) => g.statusCode === "FINISHED")

test.describe("The event overview on a phone", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await seedCache(page, [
      entry(orpc.events.get, { id: EVENT }, event),
      entry(orpc.games.list, { eventId: EVENT }, { viewerTimezone: null, games }),
    ])
    await visit(page, "event", { id: EVENT })
  })

  test("keeps the space before the dash in the title", async ({ page }) => {
    // The seed's English name for evt_001, dash and all. `toHaveText`
    // normalises whitespace, so "2026— Bangkok" would fail it and "2026 —
    // Bangkok" passes — which is exactly the difference this is about.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Sponsor Thailand Basketball League 2026 — Bangkok Round",
    )
  })

  test("lays each result out as two names beside two scores", async ({ page }) => {
    expect(finished.length, "the seed has finished games to show").toBeGreaterThan(0)
    const rows = page.locator(".result-row")
    // The page shows the last six at most.
    await expect(rows).toHaveCount(Math.min(finished.length, 6))

    const boxes = await rows.evaluateAll((els) =>
      els.map((row) => ({
        names: row.querySelector(".row-title")!.getBoundingClientRect(),
        scores: row.querySelector(".result-score")!.getBoundingClientRect(),
        height: row.getBoundingClientRect().height,
      })),
    )
    for (const b of boxes) {
      expect(b.scores.left, "the scores sit to the right of the names").toBeGreaterThan(b.names.right - 1)
      // Two lines of names and two of scores, side by side: a row is about two
      // lines tall. Stacked, it was four.
      expect(b.height, "a result is two lines, not four").toBeLessThan(80)
    }
  })
})
