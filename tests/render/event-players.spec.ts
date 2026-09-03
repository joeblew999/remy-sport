import { test, expect } from "./fixture"
import { sessionFor } from "../helpers/actors"
import { visit } from "../helpers/surfaces"
import { seedCache, entry, orpc } from "../helpers/seed-cache"
import { apiEvent, apiMyPlayer } from "../helpers/api-fixtures"
import type { ApiEvent } from "../../src/domain/api"

/**
 * Entering your child in a camp — the last of the three grants a guardian holds
 * that had nothing behind it.
 *
 * The tab is offered only for CAMP and SHOWCASE, and not because this component
 * says so: `REGISTER_PLAYER_FOR_EVENT` reads `eventTypes: ["CAMP", "SHOWCASE"]`.
 * A tournament is entered by a team. Offering the tab on a league would be a
 * form that answers 403, which is the mistake this codebase keeps making.
 */

const EVENT_ID = "evt_003"

const signedIn = sessionFor("SPECTATOR")

const child = apiMyPlayer({
  playerId: "ply_001",
  names: { en: "Somchai Prasert" },
  jerseyNumber: 7,
  positionCode: "PG",
  guardianTypeCode: "PARENT",
  teamId: "team_001",
  teamNames: { en: "Assumption U18 Boys" },
  canEdit: true,
})

const seed = (page: Parameters<typeof seedCache>[0], type: ApiEvent["typeCode"], entered: string[] = []) =>
  seedCache(page, [
    signedIn,
    entry(orpc.events.get, { id: EVENT_ID }, apiEvent({ id: EVENT_ID, typeCode: type })),
    entry(orpc.players.mine, undefined, { players: [child] }),
    entry(orpc.eventPlayers.list, undefined, {
      items: entered.map((playerId) => ({ eventId: EVENT_ID, playerId, registeredAt: "2026-03-20" })),
    }),
  ])

test.describe("Entering a player in an event", () => {
  for (const type of ["CAMP", "SHOWCASE"] as const) {
    test(`offers the tab on a ${type}`, async ({ page }) => {
      await seed(page, type)
      await visit(page, "event", { id: EVENT_ID })
      await expect(page.getByTestId("tab-players")).toBeVisible()
    })
  }

  for (const type of ["TOURNAMENT", "LEAGUE"] as const) {
    test(`withholds it on a ${type}, which teams enter`, async ({ page }) => {
      await seed(page, type)
      await visit(page, "event", { id: EVENT_ID })
      await expect(page.getByTestId("tab-teams")).toBeVisible()
      await expect(page.getByTestId("tab-players")).toHaveCount(0)
    })
  }

  test("lists your children with a way to enter each", async ({ page }) => {
    await seed(page, "CAMP")
    await visit(page, "event", { id: EVENT_ID })
    await page.getByTestId("tab-players").click()

    await expect(page.getByTestId("entry-ply_001")).toContainText("Somchai Prasert")
    await expect(page.getByTestId("enter-ply_001")).toBeVisible()
    await expect(page.getByTestId("withdraw-ply_001")).toHaveCount(0)
  })

  test("shows Withdraw instead once they are in", async ({ page }) => {
    await seed(page, "CAMP", ["ply_001"])
    await visit(page, "event", { id: EVENT_ID })
    await page.getByTestId("tab-players").click()

    await expect(page.getByTestId("entry-ply_001")).toContainText("Entered")
    await expect(page.getByTestId("withdraw-ply_001")).toBeVisible()
    await expect(page.getByTestId("enter-ply_001")).toHaveCount(0)
  })

  test("sends the entry to the server for that player and event", async ({ page }) => {
    let sent = ""
    await seed(page, "CAMP")
    await page.route("**/rpc/**", async (route) => {
      if (!route.request().url().includes("registerForEvent")) return route.fallback()
      sent = route.request().postData() ?? ""
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ json: { eventId: EVENT_ID, playerId: "ply_001", registeredAt: "2026-08-30" } }),
      })
    })

    await visit(page, "event", { id: EVENT_ID })
    await page.getByTestId("tab-players").click()
    await page.getByTestId("enter-ply_001").click()

    await expect.poll(() => sent, { message: "entering must reach the server" }).not.toBe("")
    expect(sent).toContain("ply_001")
    expect(sent).toContain(EVENT_ID)
  })

  test("asks a signed-out reader to sign in rather than showing an empty list", async ({ page }) => {
    // Two different empty states again: "nobody of yours can enter this" is a
    // fact, "we do not know who you are" is not.
    await seedCache(page, [
      entry(orpc.events.get, { id: EVENT_ID }, apiEvent({ id: EVENT_ID, typeCode: "CAMP" })),
    ])
    await visit(page, "event", { id: EVENT_ID })
    await page.getByTestId("tab-players").click()

    await expect(page.getByTestId("event-players-signin")).toBeVisible()
  })
})
