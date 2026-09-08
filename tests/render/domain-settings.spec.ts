import { test, expect } from "./fixture"
import { seedCache, entry, orpc } from "../helpers/seed-cache"
import { projectEvent, projectMyPlayers } from "../helpers/projections"
import { sessionFor } from "../helpers/actors"
import { apiMine } from "../helpers/api-fixtures"
import { visit } from "../helpers/surfaces"

test("an organiser reaches event creation from Discover without admin access", async ({ page }) => {
  await seedCache(page, [sessionFor("ORGANIZER"),
    entry(orpc.me.mine, undefined, apiMine([], ["ANY_ORGANIZER"])),
    entry(orpc.events.list, undefined, { events: [] }),
  ])
  await visit(page, "discover")
  await page.getByTestId("discover-create-event-toggle").click()
  await expect(page.getByTestId("create-event-type").locator("option")).not.toHaveCount(0)
  let sent: unknown
  await page.route("**/rpc/events/create", async (route) => {
    sent = route.request().postDataJSON().json
    await route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ code: "FORBIDDEN", message: "Forbidden" }) })
  })
  const form = page.getByTestId("create-event-form")
  await form.getByRole("textbox", { name: "Name", exact: true }).fill("New tournament")
  await form.getByRole("button", { name: "Create event", exact: true }).click()
  await expect(form.getByTestId("create-event-error")).toBeVisible()
  await expect(form.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("New tournament")
  expect(sent).toMatchObject({ names: { en: "New tournament" } })
})

test("event settings sends translations, details and explicit cleared dates", async ({ page }) => {
  const event = projectEvent("evt_002", ["OWNER"])
  await seedCache(page, [entry(orpc.events.get, { id: event.id }, event)])
  let sent: unknown
  await page.route("**/rpc/events/get**", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ json: event }),
  }))
  await page.route("**/rpc/events/update**", async (route) => {
    sent = route.request().postDataJSON().json
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ json: event }) })
  })
  await visit(page, "event", { id: event.id })
  await page.getByTestId("tab-manage").click()
  await page.locator("#event-name-ja").fill("学校リーグ")
  await page.getByLabel("Description", { exact: true }).fill("Bring indoor shoes")
  await page.getByTestId("event-start-input").fill("")
  await page.getByTestId("event-end-input").fill("")
  await page.getByTestId("event-end-input").press("Tab")
  await page.getByTestId("event-save").click()
  await expect.poll(() => sent).toBeTruthy()
  await expect(page.getByTestId("event-saved")).toBeVisible()
  expect(sent).toMatchObject({ names: { en: event.names.en, th: event.names.th, ja: "学校リーグ" },
    description: "Bring indoor shoes", startDate: null, endDate: null, timezone: event.timezone,
    typeCode: event.typeCode, formatCode: event.formatCode, isFibaCertified: event.isFibaCertified })
})

test("a coach's profile identifies their account and offers the permitted player creation journey", async ({ page }) => {
  await seedCache(page, [sessionFor("COACH"),
    entry(orpc.me.mine, undefined, apiMine([], ["ANY_COACH"])),
    entry(orpc.players.mine, undefined, { players: [] }),
  ])
  await visit(page, "profile")
  await expect(page.getByTestId("profile-identity")).toContainText("Coach")
  await expect(page.getByTestId("new-player-open")).toBeVisible()
  await page.getByTestId("new-player-open").click()
  await expect(page.getByTestId("new-player-form")).toBeVisible()
})

test("a guardian edits the player's name in each supported language", async ({ page }) => {
  const mine = projectMyPlayers("usr_spectator_001", ["GUARDIAN"])
  const player = mine.players[0]!
  await seedCache(page, [sessionFor("SPECTATOR"), entry(orpc.players.mine, undefined, mine)])
  await visit(page, "profile")
  await page.getByTestId(`edit-player-${player.playerId}`).click()
  const form = page.getByTestId(`player-form-${player.playerId}`)
  await form.locator('input[name="name"]').fill("Corrected player name")
  await form.locator('input[name="names[ja]"]').fill("選手名")
  let sent: unknown
  await page.route("**/rpc/players/update", async (route) => {
    sent = route.request().postDataJSON().json
    await route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ code: "FORBIDDEN", message: "Forbidden" }) })
  })
  await page.getByTestId(`player-save-${player.playerId}`).click()
  await expect(page.getByTestId(`player-error-${player.playerId}`)).toBeVisible()
  expect(sent).toMatchObject({ names: { en: "Corrected player name", ja: "選手名" } })
})
