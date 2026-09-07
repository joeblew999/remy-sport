import { test, expect } from "./fixture"
import { visit } from "../helpers/surfaces"
import { seedCache, entry, orpc } from "../helpers/seed-cache"
import { projectEvent, projectEntries, projectGamesIn, projectTeam, projectRoster, projectPlayer } from "../helpers/projections"

const eventId = "evt_002"
const games = projectGamesIn(eventId)
const game = games.find(g => g.statusCode === "LIVE")!
const teamId = game.homeTeamId
const roster = projectRoster(teamId)
const player = roster.players[0]!
const entries = projectEntries(eventId)
const division = entries.registered.find(t => t.teamId === teamId)!.divisionId!

test.beforeEach(async ({ page }) => {
  await seedCache(page, [
    entry(orpc.events.get, { id: eventId }, projectEvent(eventId)),
    entry(orpc.events.entries, { eventId }, entries),
    entry(orpc.games.list, { eventId }, { games, viewerTimezone: null }),
    entry(orpc.games.get, { id: game.id }, game),
    entry(orpc.teams.get, { id: teamId }, projectTeam(teamId)),
    entry(orpc.teams.roster, { teamId }, roster),
    entry(orpc.players.get, { id: player.playerId }, projectPlayer(player.playerId)),
  ])
})

test("division survives tabs, reload and language change; each game opens the right object", async ({ page }) => {
  await visit(page, "event", { id: eventId })
  await page.getByTestId("event-division").selectOption(division)
  const teamIds = new Set(entries.registered.filter(t => t.divisionId === division).map(t => t.teamId))
  const filtered = games.filter(g => teamIds.has(g.homeTeamId) && teamIds.has(g.awayTeamId))
  await expect(page.locator(".schedule-game")).toHaveCount(filtered.length)
  await page.getByTestId("tab-standings").click()
  await expect(page.getByTestId("event-division")).toHaveValue(division)
  await page.reload()
  await expect(page.getByTestId("tab-standings")).toHaveAttribute("aria-current", "page")
  await page.getByRole("button", { name: "TH", exact: true }).click()
  await expect(page.getByTestId("event-division")).toHaveValue(division)
  await expect(page.getByTestId("tab-standings")).toHaveAttribute("aria-current", "page")
  await page.getByTestId("tab-games").click()
  await page.getByTestId(`open-game-${game.id}`).click()
  await expect(page).toHaveURL(new RegExp(`#/game/${game.id}$`))
  await expect(page.getByTestId(`game-${game.id}`)).toBeVisible()
  await page.goBack()
  await expect(page.getByTestId("event-division")).toHaveValue(division)
})

test("game to team to roster to player and back never hits a dead route", async ({ page }) => {
  await visit(page, "game", { id: game.id })
  await page.locator(`.game-team-links a[href="#/team/${teamId}"]`).click()
  await page.getByRole("link", { name: "Roster", exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`#/team/${teamId}\\?section=roster$`))
  await expect(page.getByTestId("team-name")).toBeAttached()
  await page.getByTestId(`open-player-${player.playerId}`).click()
  await expect(page).toHaveURL(new RegExp(`#/player/${player.playerId}$`))
  await page.goBack()
  await expect(page.getByTestId("roster")).toBeVisible()
  await expect(page.getByText("That page does not exist.")).toHaveCount(0)
})

test("two live games at the same venue remain visible", async ({ page }) => {
  await visit(page, "event", { id: eventId, query: { tab: "places" } })
  const live = games.filter(g => g.venueId === game.venueId && ["LIVE", "HALF_TIME"].includes(g.statusCode))
  expect(live.length).toBeGreaterThan(1)
  const court = page.getByTestId(`court-${game.venueId}`)
  for (const g of live) await expect(court.getByTestId(`open-game-${g.id}`)).toBeVisible()
  await expect(court.getByRole("status")).toContainText("Multiple games")
})

test("Back restores the scrolled event list", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 450 })
  await visit(page, "event", { id: eventId, query: { tab: "games", division } })
  const link = page.getByTestId(`open-game-${game.id}`)
  await link.scrollIntoViewIfNeeded()
  const scroll = await page.locator(".page").evaluate(el => el.scrollTop)
  expect(scroll).toBeGreaterThan(0)
  await link.click()
  await expect(page.getByTestId(`game-${game.id}`)).toBeVisible()
  await page.goBack()
  await expect(page.getByTestId("event-division")).toHaveValue(division)
  await expect.poll(() => page.locator(".page").evaluate(el => el.scrollTop)).toBeCloseTo(scroll, 0)
})
