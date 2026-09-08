import { test, expect } from "./fixture"
import { visit } from "../helpers/surfaces"
import { seedCache, entry, orpc } from "../helpers/seed-cache"
import { projectGamesIn } from "../helpers/projections"

/**
 * The live list reads as games on a phone.
 *
 * Found by looking on 2026-09-06: every card was the team names wrapped one
 * word per line down a column 64px wide, the status alone on the right and
 * the score under it. The rows borrowed the team schedule's grid, whose first
 * track is a date, and a live row has no date — so both names were auto-placed
 * into the narrowest column there is. Nothing overflowed, so the no-overflow
 * check passed; the page was simply unreadable. This asks the question that
 * check cannot: do the names get most of the row, with readable scores and status below.
 */

/** The league's games that are being played right now, off the seed. */
const live = projectGamesIn("evt_002").filter((g) => g.statusCode === "LIVE")

test.describe("The live list on a phone", () => {
  test("gives the team names the row, with readable scores and status below", async ({ page }) => {
    expect(live.length, "the seed has live games to show").toBeGreaterThan(0)
    await page.setViewportSize({ width: 390, height: 844 })
    await seedCache(page, [entry(orpc.games.list, {}, { viewerTimezone: null, games: live })])
    await visit(page, "live")

    const rows = page.getByTestId("live-list").locator("[data-slot=item]")
    await expect(rows).toHaveCount(live.length)

    const boxes = await rows.evaluateAll((els) =>
      els.map((row) => {
        const box = (sel: string) => row.querySelector(sel)!.getBoundingClientRect()
        return {
          row: row.getBoundingClientRect(),
          names: box("[data-testid=live-game]"),
          status: box("[data-testid=live-status]"),
          score: box("[data-testid=live-score]"),
        }
      }),
    )
    for (const b of boxes) {
      const rowWidth = b.row.width
      expect(b.names.width, "the names have most of the row").toBeGreaterThan(rowWidth * 0.5)
      expect(b.status.top, "status does not overlap the game details").toBeGreaterThanOrEqual(b.names.bottom - 1)
      expect(b.score.left, "the score sits on the right").toBeGreaterThan(rowWidth * 0.5)
    }
  })
})
