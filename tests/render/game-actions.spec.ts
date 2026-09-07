import { test, expect } from "./fixture"
import { seedCache, entry, orpc } from "../helpers/seed-cache"
import { projectEvent, projectGame, projectEntries, type Held } from "../helpers/projections"
import { visit } from "../helpers/surfaces"
import { ACTION, GRANTS } from "../../src/domain/vocabularies"
import { SEED_ENTITIES as E } from "../../src/domain/model/entities"

const actions = ["ENTER_SCORES", "CONFIRM_MATCH_STATUS", "ASSIGN_REFEREE", "BROADCAST_GAME"] as const
const relations = [...new Set(ACTION.filter((a) => a.objectTypeCode === "GAME")
  .flatMap((a) => GRANTS[a.code].map((g) => g.relation)))]
  .filter((r) => !["PUBLIC", "ANY_SIGNED_IN"].includes(r))

for (const held of [null, [], ...relations.map((r) => [r]), ["GAME_REFEREE", "GAME_EVENT_OWNER"]] as Held[]) {
  for (const broadcasting of [false, true]) {
    test(`game actions: ${held?.join("+") || (held ? "stranger" : "visitor")}, broadcasting ${broadcasting}`, async ({ page }) => {
      const game = { ...projectGame("gam_002", held), isBroadcasting: broadcasting }
      await seedCache(page, [
        entry(orpc.events.get, { id: game.eventId }, projectEvent(game.eventId)),
        entry(orpc.games.list, { eventId: game.eventId }, { games: [game], viewerTimezone: null }),
      ])
      await visit(page, "event", { id: game.eventId })
      await page.getByTestId("tab-games").click()
      const row = page.getByTestId(`game-${game.id}`)
      await expect(row).toBeVisible()
      for (const action of actions) {
        const expected = game.can[action] && (action !== "BROADCAST_GAME" || !broadcasting)
        const gated = row.locator(`[data-action="${action}"]`)
        if (expected) await expect(gated.first()).toBeAttached()
        else await expect(gated).toHaveCount(0)
      }
      if (game.can.ENTER_SCORES) {
        await row.getByTestId(`enter-score-${game.id}`).click()
        await expect(row.getByTestId(`score-form-${game.id}`)).toBeVisible()
      }
    })
  }
}

test("fixture generation uses its own action and fixture entry uses the event clock", async ({ page }) => {
  const event = projectEvent("evt_002", ["OWNER"])
  await seedCache(page, [
    entry(orpc.events.get, { id: event.id }, { ...event, can: { ...event.can, GENERATE_FIXTURES: false } }),
    entry(orpc.events.entries, { eventId: event.id }, projectEntries(event.id)),
    entry(orpc.games.list, { eventId: event.id }, { games: [], viewerTimezone: null }),
  ])
  await visit(page, "event", { id: event.id })
  await page.getByTestId("tab-games").click()
  await expect(page.getByTestId("add-fixture")).toBeVisible()
  await expect(page.getByTestId("generate-fixtures")).toHaveCount(0)
  let sent: { startsAt?: string } = {}
  await page.route("**/rpc/games/create", async (route) => {
    sent = route.request().postDataJSON().json
    await route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ code: "FORBIDDEN", message: "Forbidden" }) })
  })
  await page.getByTestId("fixture-starts").fill("2026-09-20T10:00")
  await page.getByTestId("add-fixture-submit").click()
  await expect.poll(() => sent.startsAt).toBe("2026-09-20T03:00:00.000Z")
  await expect(page.getByTestId("add-fixture-error")).toBeVisible()
})

test("player box score submits zero and blanks distinctly and reports a refusal", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const game = projectGame("gam_002", ["GAME_REFEREE"])
  const player = E.players[0]!
  await seedCache(page, [
    entry(orpc.events.get, { id: game.eventId }, projectEvent(game.eventId)),
    entry(orpc.games.list, { eventId: game.eventId }, { games: [game], viewerTimezone: null }),
    entry(orpc.games.stats, { id: game.id }, { players: [{ gameId: game.id, playerId: player.id, names: player.names,
      points: null, rebounds: null, assists: null, fouls: null }] }),
  ])
  await visit(page, "event", { id: game.eventId })
  await page.getByTestId("tab-games").click()
  await page.getByTestId(`box-score-${game.id}`).click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  const form = page.getByTestId(`stat-line-${player.id}`)
  await form.getByLabel("Points", { exact: true }).fill("0")
  let sent: unknown
  await page.route("**/rpc/games/setPlayerStats", async (route) => {
    sent = route.request().postDataJSON().json
    await route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ code: "FORBIDDEN", message: "Forbidden" }) })
  })
  await form.getByRole("button", { name: "Save", exact: true }).click()
  await expect(form.getByRole("alert")).toBeVisible()
  expect(sent).toMatchObject({ points: 0, assists: null, rebounds: null, fouls: null })
})

test("an open score form disappears when a fresh server answer revokes permission", async ({ page }) => {
  const game = projectGame("gam_002", ["GAME_REFEREE"])
  await seedCache(page, [
    entry(orpc.events.get, { id: game.eventId }, projectEvent(game.eventId)),
    entry(orpc.games.list, { eventId: game.eventId }, { games: [game], viewerTimezone: null }),
  ])
  await visit(page, "event", { id: game.eventId })
  await page.getByTestId("tab-games").click()
  await page.getByTestId(`enter-score-${game.id}`).click()
  await page.route("**/rpc/games/setStatus", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ json: game }) }))
  await page.route("**/rpc/games/list**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ json: {
    games: [projectGame(game.id)], viewerTimezone: null,
  } }) }))
  await page.getByTestId(`game-status-${game.id}`).selectOption("FINISHED")
  await expect(page.getByTestId(`score-form-${game.id}`)).toHaveCount(0)
  await expect(page.getByTestId(`save-score-${game.id}`)).toHaveCount(0)
})
