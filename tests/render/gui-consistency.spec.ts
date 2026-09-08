import { test, expect } from "./fixture"
import { seedCache, entry, orpc } from "../helpers/seed-cache"
import { projectEvent, projectEntries, projectGamesIn, projectTeams } from "../helpers/projections"
import { visit } from "../helpers/surfaces"

test("directory failure is recoverable and never claims there are no teams", async ({ page }) => {
  await seedCache(page, [])
  await visit(page, "teams")
  await expect(page.getByTestId("page").getByRole("alert")).toBeVisible()
  await expect(page.getByTestId("teams-empty")).toHaveCount(0)
  await page.route("**/rpc/teams/list**", route => route.fulfill({
    contentType: "application/json", body: JSON.stringify({ json: { teams: projectTeams() } }),
  }))
  await page.getByTestId("page").getByRole("button", { name: "Try again" }).click()
  const link = page.getByTestId("team-row-team_001").getByRole("link")
  await expect(link).toHaveAttribute("href", "#/team/team_001")
  await link.focus()
  await expect(link).toBeFocused()
  await link.press("Enter")
  await expect(page).toHaveURL(/#\/team\/team_001$/)
})

test("game's failed event query offers retry instead of permanent loading", async ({ page }) => {
  const game = projectGamesIn("evt_002")[0]!
  await seedCache(page, [entry(orpc.games.get, { id: game.id }, game),
    entry(orpc.events.entries, { eventId: game.eventId }, projectEntries(game.eventId)),
  ])
  await visit(page, "game", { id: game.id })
  await expect(page.getByTestId("game-page").getByRole("alert")).toBeVisible()
  await expect(page.getByTestId("game-page").getByText("Loading…", { exact: true })).toHaveCount(0)
  await page.route("**/rpc/events/get**", route => route.fulfill({
    contentType: "application/json", body: JSON.stringify({ json: projectEvent(game.eventId) }),
  }))
  await page.getByTestId("game-page").getByRole("button", { name: "Try again" }).click()
  await expect(page.getByTestId(`game-${game.id}`)).toBeVisible()
})

test("empty division catalogue is an empty state, not loading", async ({ page }) => {
  await seedCache(page, [
    entry(orpc.events.get, { id: "evt_002" }, projectEvent("evt_002", ["OWNER"])),
    entry(orpc.events.entries, { eventId: "evt_002" }, projectEntries("evt_002")),
    entry(orpc.divisions.list, undefined, { items: [] }),
  ])
  await visit(page, "event", { id: "evt_002", query: { tab: "manage" } })
  await expect(page.getByTestId("divisions-empty")).toBeVisible()
  await expect(page.getByTestId("event-divisions").getByText("Loading…", { exact: true })).toHaveCount(0)
  await expect(page.getByTestId("divisions-save")).toHaveCount(0)
})

test("failed division catalogue cannot submit and can recover", async ({ page }) => {
  const entries = projectEntries("evt_002")
  await seedCache(page, [
    entry(orpc.events.get, { id: "evt_002" }, projectEvent("evt_002", ["OWNER"])),
    entry(orpc.events.entries, { eventId: "evt_002" }, entries),
  ])
  await visit(page, "event", { id: "evt_002", query: { tab: "manage" } })
  const form = page.getByTestId("event-divisions")
  await expect(form.getByRole("alert")).toBeVisible()
  await expect(page.getByTestId("divisions-save")).toHaveCount(0)
  await page.route("**/rpc/divisions/list**", route => route.fulfill({
    contentType: "application/json", body: JSON.stringify({ json: { items: [] } }),
  }))
  await form.getByRole("button", { name: "Try again" }).click()
  await expect(page.getByTestId("divisions-empty")).toBeVisible()
})

test("management fields and Save use full size controls and associated errors", async ({ page }) => {
  await seedCache(page, [entry(orpc.events.get, { id: "evt_002" }, projectEvent("evt_002", ["OWNER"]))])
  await visit(page, "event", { id: "evt_002", query: { tab: "manage" } })
  const settings = page.getByTestId("event-settings")
  const save = page.getByTestId("event-save")
  await expect(settings).toBeVisible()
  for (const control of [settings.locator("select").first(), save]) {
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  }
  const colours = await save.evaluate(el => {
    const style = getComputedStyle(el)
    return [style.backgroundColor, style.color]
  })
  expect(colours[0]).not.toBe("rgba(0, 0, 0, 0)")
  expect(colours[0]).not.toBe(colours[1])
  await page.route("**/rpc/events/update**", route => route.fulfill({ status: 400,
    contentType: "application/json", body: JSON.stringify({ json: { defined: false, code: "BAD_REQUEST", status: 400, message: "Invalid input",
      data: { issues: [{ path: ["names", "en"], message: "Name is required" }] },
    } }),
  }))
  await save.click()
  const name = page.getByTestId("event-name-input")
  await expect(name).toHaveAttribute("aria-invalid", "true")
  await expect(name).toHaveAttribute("aria-describedby", "event-name-issue")
  await expect(name).not.toHaveValue("")
})

test("content remains usable at 200 percent magnification", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await seedCache(page, [entry(orpc.teams.list, undefined, { teams: projectTeams() })])
  await visit(page, "teams")
  await page.evaluate(() => { document.documentElement.style.zoom = "2" })
  await expect(page.getByTestId("teams-list")).toBeVisible()
  expect(await page.getByTestId("page").evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThan(2)
  await page.getByTestId("team-row-team_001").getByRole("link").focus()
  await expect(page.getByTestId("team-row-team_001").getByRole("link")).toBeFocused()
})

test("the sign-in link carries the current event filters and survives reload", async ({ page }) => {
  const event = projectEvent("evt_002")
  const entries = projectEntries(event.id)
  const division = entries.divisions[0]!.id
  await seedCache(page, [entry(orpc.events.get, { id: event.id }, event),
    entry(orpc.events.entries, { eventId: event.id }, entries),
  ])
  await visit(page, "event", { id: event.id, query: { tab: "teams", division } })
  const from = new URL(page.url()).hash
  const signIn = page.getByTestId("topbar-sign-in")
  await expect(signIn).toHaveAttribute("href", `#/login?next=${encodeURIComponent(from)}`)
  await signIn.click()
  await page.reload()
  await expect(signIn).toHaveAttribute("href", `#/login?next=${encodeURIComponent(from)}`)
})

for (const width of [320, 390, 1440]) {
  for (const locale of ["en", "th", "ja"]) {
    test(`directory and sign-in align at ${width}px in ${locale}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.addInitScript(l => localStorage.setItem("remy.locale", l), locale)
      await seedCache(page, [entry(orpc.teams.list, undefined, { teams: projectTeams() })])
      await visit(page, "teams")
      const title = page.getByTestId("page").getByRole("heading", { level: 1 })
      const list = page.getByTestId("teams-list")
      await expect(list).toBeVisible()
      const titleBox = await title.boundingBox()
      const listBox = await list.boundingBox()
      expect(Math.abs(titleBox!.x - listBox!.x)).toBeLessThan(2)
      expect(await page.getByTestId("page").evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThan(2)
      const link = page.getByTestId("team-row-team_001").getByRole("link")
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44)
      await visit(page, "login")
      await expect(page.getByTestId("spa-email-input")).toBeVisible()
      const heading = await page.getByTestId("page").getByRole("heading", { level: 1 }).boundingBox()
      const form = await page.getByTestId("page").locator("form").boundingBox()
      expect(Math.abs(heading!.x - form!.x)).toBeLessThan(2)
      expect(await page.getByTestId("page").evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThan(2)
    })
  }
}
