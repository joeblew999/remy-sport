import { test, expect } from "./fixture"
import { visit } from "../helpers/surfaces"
import { seedCache, entry, orpc } from "../helpers/seed-cache"
import { projectEvent, projectGamesIn } from "../helpers/projections"

/** Games replaces Overview, keeping the event title and useful phone layout. */

/** The tournament whose name carries a dash, off the seed. */
const EVENT = "evt_001"
const event = projectEvent(EVENT)
const games = projectGamesIn(EVENT)
const finished = games.filter((g) => g.statusCode === "FINISHED")

test.describe("Event Games on a phone", () => {
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

  test("opens on games with live fixtures before results and real game links", async ({ page }) => {
    const rows = page.getByTestId("schedule").locator("[data-slot=item]")
    await expect(rows).toHaveCount(games.length)
    const first = games.find(g => g.statusCode === "LIVE" || g.statusCode === "HALF_TIME") ?? games.find(g => g.statusCode === "SCHEDULED") ?? finished.at(-1)!
    await expect(rows.first()).toHaveAttribute("data-testid", `game-${first.id}`)
    await expect(rows.first().getByTestId(`open-game-${first.id}`)).toHaveAttribute("href", `#/game/${first.id}`)
    await expect(page.getByTestId("tab-games")).toHaveAttribute("aria-current", "page")
    await expect(page.getByTestId("tab-overview")).toHaveCount(0)
    expect(await page.locator("body").evaluate(el => el.scrollWidth <= window.innerWidth)).toBe(true)
  })
})
