import { test, expect } from "./fixture"
import { seedCache, entry, orpc } from "../helpers/seed-cache"
import { apiGame, apiRoster, type ApiGame, type ApiRoster } from "../helpers/api-fixtures"
import { sessionKey } from "../../src/web/lib/session"
import { apiTeam } from "../helpers/api-fixtures"

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

/**
 * From the shared factory, typed, no cast.
 *
 * This was a character-for-character copy of `apiTeam`'s body ending in
 * `as never` — so the factory written to stop fixture drift was dead code while
 * the drift it prevents sat in the file next door.
 */
const team = (over: Partial<Parameters<typeof apiTeam>[0]> = {}) => apiTeam(over)

/**
 * One game as `games.list` returns it.
 *
 * Spread over a base of the fields the row does not read, so each test states
 * only what it is actually about — which side this team was on, and whether the
 * game has been played.
 *
 * From `apiGame`, so the base is the whole response. The literal that was here
 * had nine of the eighteen fields and took `Record<string, unknown>` overrides,
 * so neither the missing half nor a mistyped override was ever going to be
 * noticed.
 */
const game = (over: Partial<ApiGame>) =>
  apiGame({
    eventId: "evt_002",
    venueId: "ven_004",
    venueNames: { en: "Triam Udom Indoor Court" },
    startsAt: "2026-06-14T12:00:00Z",
    ...over,
  })

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
      entry(orpc.teams.roster, { teamId: "team_002" }, apiRoster({
        players: [
          { playerId: "ply_002", names: { en: "Kanya T." }, jerseyNumber: 7, positionCode: "SG", fromDate: "2026-01-01" },
        ],
      })),
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
      entry(orpc.teams.roster, { teamId: "team_002" }, apiRoster()),
    ])
    await page.goto("/#/team/team_002")
    await expect(page.getByTestId("roster-empty")).toBeVisible()
  })

  test("the schedule is this team's real games, seen from their end", async ({ page }) => {
    await seedCache(page, [
      entry(orpc.teams.get, { id: "team_002" }, team()),
      entry(
        orpc.games.list,
        { teamId: "team_002" },
        {
          viewerTimezone: null,
          games: [
            // Away, and won: the page has to read the score off the correct end
            // of the fixture. Home-only logic renders this as a 61-74 loss.
            game({
              id: "gam_101",
              homeTeamId: "team_009",
              awayTeamId: "team_002",
              homeTeamNames: { en: "Satriwitthaya U18 Girls" },
              awayTeamNames: { en: "Triam Udom U18 Girls" },
              statusCode: "FINISHED",
              homeScore: 61,
              awayScore: 74,
            }),
            // Not played: no score, and no outcome either.
            game({
              id: "gam_102",
              homeTeamId: "team_002",
              awayTeamId: "team_010",
              homeTeamNames: { en: "Triam Udom U18 Girls" },
              awayTeamNames: { en: "Assumption Convent U18 Girls" },
              statusCode: "SCHEDULED",
              homeScore: null,
              awayScore: null,
            }),
          ],
        },
      ),
    ])
    await page.goto("/#/team/team_002")

    const schedule = page.locator(".fixture-row")
    await expect(schedule).toHaveCount(2)

    // The opponent, not whoever happens to be the home side.
    await expect(schedule.first()).toContainText("Satriwitthaya")
    // Their score first, then the opponent's — 74–61, not 61–74.
    await expect(schedule.first().locator(".result")).toHaveText("74–61")
    // "W", the same single character the standings column uses — and a real
    // abbreviation in each language ("ช", "勝"), not an English initial.
    await expect(schedule.first().locator(".outcome")).toHaveText("W")

    // An unplayed game has no result and no outcome to claim.
    await expect(schedule.nth(1).locator(".result")).toHaveText("—")
    await expect(schedule.nth(1).locator(".outcome")).not.toHaveText("W")
    await expect(schedule.nth(1).locator(".outcome")).not.toHaveText("L")
  })

  test("says so when a team has no fixtures, rather than inventing a season", async ({ page }) => {
    await seedCache(page, [
      entry(orpc.teams.get, { id: "team_002" }, team()),
      entry(orpc.games.list, { teamId: "team_002" }, { viewerTimezone: null, games: [] }),
    ])
    await page.goto("/#/team/team_002")
    await expect(page.locator(".fixture-row")).toHaveCount(0)
    await expect(page.getByText("No games scheduled yet.")).toBeVisible()
  })
})


/**
 * Managing the squad. The controls appear on the server's word — MANAGE_ROSTER
 * asked per team — not on anything the page works out about the viewer.
 */
test.describe("Squad management", () => {
  const roster = (over: Partial<ApiRoster>) =>
    apiRoster({
      players: [
        { playerId: "ply_002", names: { en: "Kanya T." }, jerseyNumber: 7, positionCode: "SG", fromDate: "2026-01-01" },
      ],
      ...over,
    })

  const show = async (page: Parameters<typeof seedCache>[0], data: ApiRoster) => {
    await seedCache(page, [
      entry(orpc.teams.get, { id: "team_002" }, team()),
      entry(orpc.teams.roster, { teamId: "team_002" }, data),
    ])
    await page.goto("/#/team/team_002")
  }

  test("a reader who may not manage sees no controls at all", async ({ page }) => {
    await show(page, roster({}))
    await expect(page.getByTestId("roster")).toBeVisible()
    await expect(page.getByTestId("manage-roster")).toHaveCount(0)
  })

  test("a coach can remove a player and add one who is not on the squad", async ({ page }) => {
    await show(page, roster({
      canManage: true,
      available: [{ playerId: "ply_003", names: { en: "Nong P." }, jerseyNumber: 11 }],
    }))
    await expect(page.getByTestId("manage-roster")).toBeVisible()
    await expect(page.getByTestId("remove-player-ply_002")).toBeVisible()
    await expect(page.getByTestId("add-player-select")).toContainText("Nong P.")
  })

  test("says so when there is nobody left to add", async ({ page }) => {
    await show(page, roster({ canManage: true, available: [] }))
    await expect(page.getByTestId("no-available-players")).toBeVisible()
    await expect(page.getByTestId("add-player-form")).toHaveCount(0)
  })

  /**
   * The dead end that "nobody left to add" used to be.
   *
   * `available` is the players already on the platform who are not on this
   * team, so a coach with a new signing saw "everyone is on the squad" and had
   * nowhere to go. `players.create` was built and enforced and reachable only
   * by curl — CREATE_PLAYER is granted to ANY_COACH, and no screen called it.
   */
  test("offers a new player even when there is nobody left to add", async ({ page }) => {
    await show(page, roster({ canManage: true, available: [] }))
    await expect(page.getByTestId("new-player-open")).toBeVisible()
    await page.getByTestId("new-player-open").click()
    await expect(page.getByTestId("new-player-form")).toBeVisible()
    // A date control, not a text box: the API wants YYYY-MM-DD.
    await expect(page.getByTestId("new-player-dob")).toHaveAttribute("type", "date")
    // Positions come from the model's vocabulary, never a list typed here.
    await expect(page.getByTestId("new-player-position").locator("option")).not.toHaveCount(0)
  })

  test("creates the player and puts them on the squad", async ({ page }) => {
    await show(page, roster({ canManage: true, available: [] }))
    // The SPA speaks the `/rpc/` transport, not the OpenAPI paths — routing
    // `**/api/players` matched nothing and the calls array stayed empty.
    const calls: string[] = []
    await page.route("**/rpc/**", async (route) => {
      const url = route.request().url()
      if (url.includes("players/create")) {
        calls.push("create")
        // `RPCLink`'s wire format, not a bare object: the response is
        // `{ json: ... }`, and fulfilling with the plain body left playerId
        // undefined, so the second call never happened and the failure looked
        // like the chain being broken.
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ json: { playerId: "ply_new", names: { en: "Somchai" }, jerseyNumber: 7 } }),
        })
      }
      if (url.includes("teams/addPlayer")) {
        calls.push("add")
        return route.fulfill({ status: 201, contentType: "application/json", body: '{"json":{}}' })
      }
      return route.fallback()
    })

    await page.getByTestId("new-player-open").click()
    await page.getByTestId("new-player-name").fill("Somchai")
    await page.getByTestId("new-player-dob").fill("2012-04-18")
    await page.getByTestId("new-player-number").fill("7")
    await page.getByTestId("new-player-save").click()

    // Both actions, in order: CREATE_PLAYER puts them on the platform and
    // MANAGE_ROSTER puts them on this team. The coach means both.
    await expect.poll(() => calls).toEqual(["create", "add"])
    await expect(page.getByTestId("new-player-form")).toHaveCount(0)
  })

  test("is not offered to somebody who may not manage the squad", async ({ page }) => {
    await show(page, roster({ canManage: false }))
    await expect(page.getByTestId("new-player-open")).toHaveCount(0)
  })
})

test.describe("A team's details", () => {
  /**
   * `teams.update` was enforced by EDIT_TEAM_PROFILE and unreachable, so a team
   * named wrong at creation stayed named wrong — and its age group and
   * category, which decide which events it can enter, could never be corrected.
   *
   * Gated on `canEdit`: the server's answer for this reader on this team, not a
   * role check here. A rule in the client could only be right by accident.
   */
  test("offers no form to someone who may not edit", async ({ page }) => {
    await seedCache(page, [
      entry(orpc.teams.get, { id: "team_002" }, team({ canEdit: false })),
      entry(orpc.teams.roster, { teamId: "team_002" }, apiRoster()),
    ])
    await page.goto("/#/team/team_002")

    await expect(page.getByTestId("team-name")).toBeVisible()
    await expect(page.getByTestId("team-settings")).toHaveCount(0)
  })

  test("prefills from what is stored, for a coach", async ({ page }) => {
    await seedCache(page, [
      entry(orpc.teams.get, { id: "team_002" }, team({ canEdit: true })),
      entry(orpc.teams.roster, { teamId: "team_002" }, apiRoster()),
    ])
    await page.goto("/#/team/team_002")

    await expect(page.getByTestId("team-settings")).toBeVisible()
    await expect(page.getByTestId("team-name-input")).toHaveValue("Triam Udom U18 Girls")
    await expect(page.getByTestId("team-age-input")).toHaveValue("U18")
    await expect(page.getByTestId("team-gender-input")).toHaveValue("F")
  })

  test("keeps the other languages when saving the English name", async ({ page }) => {
    // Silent and permanent otherwise: sending `{ en }` alone deletes the Thai
    // and Japanese names, and nobody reading an English page ever notices.
    let sent = ""
    await seedCache(page, [
      entry(
        orpc.teams.get,
        { id: "team_002" },
        team({ canEdit: true, names: { en: "Triam Udom U18 Girls", th: "เตรียมอุดม U18 หญิง" } }),
      ),
      entry(orpc.teams.roster, { teamId: "team_002" }, apiRoster()),
    ])
    await page.route("**/rpc/**", async (route) => {
      if (!route.request().url().includes("teams/update")) return route.fallback()
      sent = route.request().postData() ?? ""
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ json: team({ canEdit: true }) }),
      })
    })

    await page.goto("/#/team/team_002")
    await page.getByTestId("team-name-input").fill("Triam Udom Girls")
    await page.getByTestId("team-save").click()

    await expect.poll(() => sent, { message: "save must reach the server" }).not.toBe("")
    expect(sent).toContain("Triam Udom Girls")
    expect(sent, "the Thai name must survive").toContain("เตรียมอุดม U18 หญิง")
  })
})

test.describe("The team hero's buttons", () => {
  test("go somewhere, rather than being decoration", async ({ page }) => {
    // Three of them were `<button className="btn">` with no onClick, sitting
    // beside a Follow button that worked. A dead control is worse than no
    // control: pressing it and getting nothing reads as the app being broken.
    // Stats was deleted outright — the model has no per-player statistics.
    await seedCache(page, [
      entry(orpc.teams.get, { id: "team_002" }, team()),
      entry(orpc.teams.roster, { teamId: "team_002" }, apiRoster()),
    ])
    await page.goto("/#/team/team_002")

    await expect(page.getByRole("link", { name: "Roster" })).toHaveAttribute("href", "#roster")
    await expect(page.getByRole("link", { name: "Schedule" })).toHaveAttribute(
      "href",
      "#team-schedule",
    )
    await expect(page.getByRole("button", { name: "Stats" })).toHaveCount(0)
  })
})

test.describe("Coaching staff", () => {
  /**
   * `team_coaches` had this from the start and the page never showed it. The
   * server withholds it from a signed-out reader — a roster of children is what
   * a gym wall shows, the adults responsible for them are not — so the page has
   * two empty states that mean different things and must not be confused.
   */
  const withCoaches = apiRoster({
    coaches: [
      { userId: "u1", name: "Somchai Prasert", coachRoleCode: "HEAD" },
      { userId: "u2", name: "Nid Chaiyaporn", coachRoleCode: "ASSISTANT" },
    ],
  })

  test("names them, with the role in the reader's language", async ({ page }) => {
    await seedCache(page, [
      entry(orpc.teams.get, { id: "team_002" }, team()),
      entry(orpc.teams.roster, { teamId: "team_002" }, withCoaches),
      {
        queryKey: sessionKey as unknown as readonly unknown[],
        data: { user: { id: "u9", email: "a@b.test", name: "A", role: "user" }, session: {} },
      },
    ])
    await page.goto("/#/team/team_002")

    await expect(page.getByTestId("coach-u1")).toContainText("Somchai Prasert")
    // From the reference vocabulary, not a map of role codes in the page.
    await expect(page.getByTestId("coach-u1")).toContainText("Head Coach")
    await expect(page.getByTestId("coach-u2")).toContainText("Assistant Coach")
  })

  test("tells a signed-out reader why the list is empty", async ({ page }) => {
    // Not the same as "this team has no coaches", and the page must not say
    // that — it would be stating as fact something it was refused.
    await seedCache(page, [
      entry(orpc.teams.get, { id: "team_002" }, team()),
      entry(orpc.teams.roster, { teamId: "team_002" }, { ...withCoaches, coaches: [] }),
    ])
    await page.goto("/#/team/team_002")

    await expect(page.getByTestId("coaches-signin")).toBeVisible()
    await expect(page.getByTestId("coaches-empty")).toHaveCount(0)
  })

  test("says so when a signed-in reader genuinely sees none", async ({ page }) => {
    await seedCache(page, [
      entry(orpc.teams.get, { id: "team_002" }, team()),
      entry(orpc.teams.roster, { teamId: "team_002" }, { ...withCoaches, coaches: [] }),
      {
        queryKey: sessionKey as unknown as readonly unknown[],
        data: { user: { id: "u9", email: "a@b.test", name: "A", role: "user" }, session: {} },
      },
    ])
    await page.goto("/#/team/team_002")

    await expect(page.getByTestId("coaches-empty")).toBeVisible()
    await expect(page.getByTestId("coaches-signin")).toHaveCount(0)
  })
})
