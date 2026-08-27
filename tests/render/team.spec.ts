import { test, expect } from "./fixture"
import { seedCache, entry, orpc } from "../helpers/seed-cache"

/**
 * Rendering, with the cache handed its data instead of the network.
 *
 * These assertions are about a `<div>`. Under the old shape each one seeded
 * D1, signed somebody in and waited on a real round trip through a Worker — a
 * database for a placeholder string.
 *
 * `seedCache` sets `window.__QUERY_SEED__` before the bundle runs, so TanStack
 * reads the value synchronously on mount and never fetches. There is no
 * `signIn`, no `beforeAll`, no dependency on seeded rows, and nothing to wait
 * for. The whole file is a page load and an assertion.
 *
 * It stays type-safe rather than becoming a fixture graveyard: the key comes
 * from `orpc.teams.get.queryKey()`, the same one the component subscribes to,
 * and the data is checked against the procedure's real return type. Rename the
 * procedure or change the response shape and this fails `mise run typecheck` —
 * not a browser run three minutes later.
 */

const team = (over: Record<string, unknown> = {}) =>
  ({
    id: "team_002",
    name: "Triam Udom U18 Girls",
    names: { en: "Triam Udom U18 Girls" },
    orgId: "org_002",
    ageGroupCode: "U18",
    genderCode: "F",
    orgName: "Triam Udom Suksa School",
    orgNames: { en: "Triam Udom Suksa School" },
    orgCityCode: "BANGKOK",
    orgProvinceCode: "BKK",
    ...over,
  }) as never

test.describe("Team page renders what the API returned", () => {
  test("shows the team, its school and its division", async ({ page }) => {
    await seedCache(page, [entry(orpc.teams.get, { id: "team_002" }, team())])

    await page.goto("/#/team/team_002")
    await expect(page.getByTestId("team-name")).toHaveText("Triam Udom U18 Girls")
    await expect(page.locator(".team-hero")).toContainText("Triam Udom Suksa School")
    await expect(page.locator(".team-hero")).toContainText("U18 Girls")
  })

  test("a different id renders a different team", async ({ page }) => {
    await seedCache(page, [
      entry(
        orpc.teams.get,
        { id: "team_003" },
        team({
          id: "team_003",
          name: "Montfort U16 Boys",
          names: { en: "Montfort U16 Boys" },
          orgName: "Montfort College",
          orgNames: { en: "Montfort College" },
          orgCityCode: "CHIANG_MAI",
          ageGroupCode: "U16",
          genderCode: "M",
        }),
      ),
    ])

    await page.goto("/#/team/team_003")
    await expect(page.getByTestId("team-name")).toHaveText("Montfort U16 Boys")
  })

  test("record shows a placeholder, not an invented win-loss", async ({ page }) => {
    // No games table exists yet, so "4–0" must not reappear as if it were real.
    // AGENTS.md: never invent a value for a field with no table.
    await seedCache(page, [entry(orpc.teams.get, { id: "team_002" }, team())])

    await page.goto("/#/team/team_002")
    await expect(page.locator(".team-hero")).toContainText("RECORD")
    await expect(page.locator(".team-hero")).not.toContainText("4–0")
  })
})

test.describe("Team page, the rest", () => {
  /**
   * The roster is real now — `player` and `playerTeam` — so it is no longer
   * labelled SAMPLE DATA. What is still fixture-backed on this page says so.
   */
  test("the roster renders the squad it was given, without inventing stats", async ({ page }) => {
    await seedCache(page, [
      entry(orpc.teams.get, { id: "team_002" }, team()),
      entry(orpc.teams.roster, { teamId: "team_002" }, {
        canManage: false,
        players: [
          { playerId: "ply_002", names: { en: "Kanya T." }, jerseyNumber: 7, positionCode: "SG", fromDate: "2026-01-01" },
        ],
      } as never),
    ])
    await page.goto("/#/team/team_002")

    await expect(page.getByTestId("player-ply_002")).toContainText("Kanya T.")
    await expect(page.getByTestId("player-ply_002")).toContainText("7")
    // No per-game averages: there is no stats table, so the numbers the old
    // fixture showed are absent rather than invented again.
    await expect(page.getByTestId("roster")).not.toContainText("PPG")
    await expect(page.locator(".section-h", { hasText: "Roster" })).not.toContainText("SAMPLE DATA")
  })

  test("an empty roster says so rather than rendering nothing", async ({ page }) => {
    await seedCache(page, [
      entry(orpc.teams.get, { id: "team_002" }, team()),
      entry(orpc.teams.roster, { teamId: "team_002" }, { canManage: false, players: [] } as never),
    ])
    await page.goto("/#/team/team_002")
    await expect(page.getByTestId("roster-empty")).toBeVisible()
  })

  test("what is still a fixture is still labelled", async ({ page }) => {
    await seedCache(page, [entry(orpc.teams.get, { id: "team_002" }, team())])
    await page.goto("/#/team/team_002")
    // The schedule section on this page has no endpoint yet.
    await expect(page.locator(".section-h", { hasText: "Schedule" })).toContainText("SAMPLE DATA")
  })
})
