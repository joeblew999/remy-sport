import { test, expect } from "./fixture"
import { sessionFor } from "../helpers/actors"
import { visit } from "../helpers/surfaces"
import { seedCache, entry, orpc } from "../helpers/seed-cache"
import { apiMine, type ApiRoster } from "../helpers/api-fixtures"
import { projectGamesIn, projectRoster, projectTeam, type Held } from "../helpers/projections"

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
 * The team, read off the seed rather than described.
 *
 * This was a character-for-character copy of `apiTeam`'s body ending in
 * `as never`, then a call to that factory whose defaults were Triam Udom's — so
 * a test naming a different team had to restate its school, its city and its
 * division, and one that forgot left `team_001` called "Assumption" at "Triam
 * Udom Suksa School".
 *
 * `projectTeam` takes the id and there is nothing else to state. What it returns
 * is proven equal to the real procedure by
 * tests/worker/projection-equivalence.test.ts.
 */
const team = (id: string, as: Held = []) => projectTeam(id, as)

/** The seeded team this file is mostly about: Triam Udom's U18 girls. */
const TEAM = "team_002"

/** This team's own fixtures, from either end, as the schedule shows them. */
const theirGames = projectGamesIn("evt_002").filter(
  (g) => g.homeTeamId === TEAM || g.awayTeamId === TEAM,
)
const away = theirGames.find((g) => g.awayTeamId === TEAM && g.statusCode === "FINISHED")!
const unplayed = theirGames.find((g) => g.statusCode === "SCHEDULED")!


test.describe("Team page renders what the API returned", () => {
  test("shows the team, its school and its division", async ({ page }) => {
    await seedCache(page, [entry(orpc.teams.get, { id: TEAM }, team(TEAM))])

    await visit(page, "team", { id: "team_002" })
    await expect(page.getByTestId("team-name")).toHaveText("Triam Udom U18 Girls")
    await expect(page.getByTestId("team-hero")).toContainText("Triam Udom Suksa School")
    // Assert the division label, not the abbreviation inside the team name
    // (that name now lives in the shared topbar).
    await expect(page.getByTestId("team-hero")).toContainText("Under 18 Girls")
  })

  test("a different id renders a different team", async ({ page }) => {
    await seedCache(page, [
      // Nothing but the id. Restating the school, city and division was how a
      // fixture once had team_001 called "Assumption" at "Triam Udom Suksa
      // School" — the negative assertion then failed against a page that was
      // right.
      entry(orpc.teams.get, { id: "team_003" }, team("team_003")),
    ])

    await visit(page, "team", { id: "team_003" })
    await expect(page.getByTestId("team-name")).toHaveText("Montfort U16 Boys")
    // ...and it is genuinely a different school, not the same one relabelled.
    await expect(page.getByTestId("team-hero")).toContainText("Montfort College")
    await expect(page.getByTestId("team-hero")).not.toContainText("Triam Udom")
  })

  test("a live lead is not a win and spoiler mode hides the team record", async ({ page }) => {
    const live = { ...away, statusCode: "LIVE" as const }
    await seedCache(page, [
      entry(orpc.teams.get, { id: TEAM }, team(TEAM)),
      entry(orpc.games.list, { teamId: TEAM }, { viewerTimezone: null, games: [live] }),
    ])
    await visit(page, "team", { id: TEAM })
    await expect(page.getByTestId("team-record")).toHaveText("—")
    // The spoiler switch is in the sidebar's Settings group (B2 step 8); a
    // switch has the switch role, not button.
    await page.getByRole("switch", { name: "Spoiler mode" }).click()
    await page.getByTestId("tab-schedule").click()
    await expect(page.getByTestId("fixture-result")).toHaveText("—")
  })

  test("record is a dash until a game has been played, never an invented win-loss", async ({ page }) => {
    // "4–0" was once hardcoded here. The record is counted from the games
    // list now, and with none there is nothing to count.
    await seedCache(page, [
      entry(orpc.teams.get, { id: TEAM }, team(TEAM)),
      entry(orpc.games.list, { teamId: TEAM }, { viewerTimezone: null, games: [] }),
    ])

    await visit(page, "team", { id: "team_002" })
    await expect(page.getByTestId("team-hero")).toContainText("Record")
    await expect(page.getByTestId("team-record")).toHaveText("—")
  })
})

test.describe("Team page, the rest", () => {
  /**
   * The roster is real now — `player` and `playerTeam` — so it is no longer
   * labelled SAMPLE DATA. What is still fixture-backed on this page says so.
   */
  test("the roster renders the squad it was given, without inventing stats", async ({ page }) => {
    await seedCache(page, [
      entry(orpc.teams.get, { id: TEAM }, team(TEAM)),
      entry(orpc.teams.roster, { teamId: TEAM }, projectRoster(TEAM)),
    ])
    await visit(page, "team", { id: TEAM })

    // The team's real squad, so this asserts what a reader sees rather than a
    // one-player fixture. Derived, so a roster change does not edit the test.
    const squad = projectRoster(TEAM).players
    expect(squad.length, "team_002 should have a seeded squad").toBeGreaterThan(0)
    for (const player of squad) {
      const row = page.getByTestId(`player-${player.playerId}`)
      await expect(row).toContainText(player.names.en!)
      await expect(row).toContainText(String(player.jerseyNumber))
    }
    // No per-game averages: there is no stats table, so the numbers the old
    // fixture showed are absent rather than invented again.
    await expect(page.getByTestId("roster")).not.toContainText("PPG")
    await expect(page.getByRole("tabpanel", { name: "Roster", exact: true })).not.toContainText("SAMPLE DATA")
  })

  test("an empty roster says so rather than rendering nothing", async ({ page }) => {
    await seedCache(page, [
      entry(orpc.teams.get, { id: TEAM }, team(TEAM)),
      // Empty on purpose: a team whose squad has not been entered yet.
      entry(orpc.teams.roster, { teamId: TEAM }, { ...projectRoster(TEAM), players: [] }),
    ])
    await visit(page, "team", { id: TEAM })
    await expect(page.getByTestId("roster-empty")).toBeVisible()
  })

  test("the schedule is this team's real games, seen from their end", async ({ page }) => {
    await seedCache(page, [
      entry(orpc.teams.get, { id: TEAM }, team(TEAM)),
      entry(
        orpc.games.list,
        { teamId: "team_002" },
        {
          viewerTimezone: null,
          games: [
            /**
             * Away, and won: the page has to read the score off the correct end
             * of the fixture. Home-only logic renders this as a loss.
             *
             * Both of these were invented — gam_101 and gam_102, ids no row
             * held — because team_002 played all three of its seeded games at
             * home, so the away branch had no data. It has one now (gam_032),
             * added when this test was converted: the premise was real and the
             * fixtures did not support it.
             */
            away,
            // Not played: no score, and no outcome either.
            unplayed,
          ],
        },
      ),
    ])
    await visit(page, "team", { id: "team_002" })

    await page.getByTestId("tab-schedule").click()
    const schedule = page.getByTestId("team-fixture")
    await expect(schedule).toHaveCount(2)

    // The opponent, not whoever happens to be the home side.
    await expect(schedule.first()).toContainText("Satriwitthaya")
    // Their score first, then the opponent's — 74–61, not 61–74.
    await expect(schedule.first().getByTestId("fixture-result")).toHaveText("74–61")
    // "W", the same single character the standings column uses — and a real
    // abbreviation in each language ("ช", "勝"), not an English initial.
    await expect(schedule.first().getByTestId("fixture-outcome")).toHaveText("W")

    // An unplayed game has no result and no outcome to claim.
    await expect(schedule.nth(1).getByTestId("fixture-result")).toHaveText("—")
    await expect(schedule.nth(1).getByTestId("fixture-outcome")).not.toHaveText("W")
    await expect(schedule.nth(1).getByTestId("fixture-outcome")).not.toHaveText("L")

    // The record in the hero is these same rows counted: one win, and the
    // unplayed game counts for nothing. It was a dash above five results.
    await expect(page.getByTestId("team-record")).toHaveText("1–0")
  })

  test("says so when a team has no fixtures, rather than inventing a season", async ({ page }) => {
    await seedCache(page, [
      entry(orpc.teams.get, { id: TEAM }, team(TEAM)),
      entry(orpc.games.list, { teamId: TEAM }, { viewerTimezone: null, games: [] }),
    ])
    await visit(page, "team", { id: "team_002" })
    await expect(page.getByTestId("team-fixture")).toHaveCount(0)
    await page.getByTestId("tab-schedule").click()
    await expect(page.getByText("No games scheduled yet.")).toBeVisible()
  })
})


/**
 * Managing the squad. The controls appear on the server's word — MANAGE_ROSTER
 * asked per team — not on anything the page works out about the viewer.
 */
test.describe("Squad management", () => {
  /**
   * The team's real squad, with whatever this test is about laid over it.
   *
   * `available` is the one thing that cannot derive: it is the server's answer
   * about who *this reader* could add, so a spec that is about adding somebody
   * states them.
   */
  const roster = (over: Partial<ApiRoster>) => ({ ...projectRoster(TEAM), ...over })

  // `as` is who the reader is on the team; MANAGE_ROSTER is the team row's answer.
  const show = async (page: Parameters<typeof seedCache>[0], data: ApiRoster, as: Held = []) => {
    await seedCache(page, [
      ...(as?.length ? [sessionFor("COACH")] : []),
      entry(orpc.me.mine, undefined, apiMine([], as?.length ? ["ANY_COACH"] : [])),
      entry(orpc.teams.get, { id: TEAM }, team(TEAM, as)),
      entry(orpc.teams.roster, { teamId: TEAM }, data),
    ])
    await visit(page, "team", { id: "team_002" })
    if (as?.length) await page.getByTestId("tab-manage").click()
  }

  test("a reader who may not manage sees no controls at all", async ({ page }) => {
    await show(page, roster({}))
    await expect(page.getByTestId("roster")).toBeVisible()
    await expect(page.getByTestId("manage-roster")).toHaveCount(0)
  })

  test("a coach can remove a player and add one who is not on the squad", async ({ page }) => {
    // Somebody actually on this squad, and somebody actually on another one —
    // `ply_002` was neither, having left team_001 in March and never been here.
    const onSquad = projectRoster(TEAM).players[0]!
    const elsewhere = projectRoster("team_003").players[0]!
    await show(page, roster({
      available: [
        {
          playerId: elsewhere.playerId,
          names: elsewhere.names,
          jerseyNumber: elsewhere.jerseyNumber,
        },
      ],
    }), ["HEAD_COACH"])
    await expect(page.getByTestId("manage-roster")).toBeVisible()
    await expect(page.getByTestId(`remove-player-${onSquad.playerId}`)).toBeVisible()
    await expect(page.getByTestId("add-player-select")).toContainText(elsewhere.names.en!)
  })

  test("says so when there is nobody left to add", async ({ page }) => {
    await show(page, roster({ available: [] }), ["HEAD_COACH"])
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
    await show(page, roster({ available: [] }), ["HEAD_COACH"])
    await expect(page.getByTestId("new-player-open")).toBeVisible()
    await page.getByTestId("new-player-open").click()
    await expect(page.getByTestId("new-player-form")).toBeVisible()
    // A date control, not a text box: the API wants YYYY-MM-DD.
    await expect(page.getByTestId("new-player-dob")).toHaveAttribute("type", "date")
    // Positions come from the model's vocabulary, never a list typed here.
    await expect(page.getByTestId("new-player-position").locator("option")).not.toHaveCount(0)
  })

  test("creates the player and puts them on the squad", async ({ page }) => {
    await show(page, roster({ available: [] }), ["HEAD_COACH"])
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
    await show(page, roster({}))
    await expect(page.getByTestId("new-player-open")).toHaveCount(0)
  })
})

test.describe("A team's details", () => {
  /**
   * `teams.update` was enforced by EDIT_TEAM_PROFILE and unreachable, so a team
   * named wrong at creation stayed named wrong — and its age group and
   * category, which decide which events it can enter, could never be corrected.
   *
   * Gated on `can.EDIT_TEAM_PROFILE`: the server's answer for this reader on this team, not a
   * role check here. A rule in the client could only be right by accident.
   */
  test("offers no form to someone who may not edit", async ({ page }) => {
    await seedCache(page, [
      entry(orpc.teams.get, { id: TEAM }, team(TEAM)),
      entry(orpc.teams.roster, { teamId: TEAM }, projectRoster(TEAM)),
    ])
    await visit(page, "team", { id: "team_002" })

    await expect(page.getByTestId("team-name")).toBeVisible()
    await expect(page.getByTestId("team-settings")).toHaveCount(0)
  })

  test("prefills from what is stored, for a coach", async ({ page }) => {
    await seedCache(page, [
      entry(orpc.teams.get, { id: TEAM }, team(TEAM, ["HEAD_COACH"])),
      entry(orpc.teams.roster, { teamId: TEAM }, projectRoster(TEAM)),
    ])
    await visit(page, "team", { id: "team_002" })

    await page.getByTestId("tab-manage").click()
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
      // The seeded team is already bilingual, which is the whole premise: the
      // Thai name has to survive a save made from the English page.
      entry(orpc.teams.get, { id: TEAM }, team(TEAM, ["HEAD_COACH"])),
      entry(orpc.teams.roster, { teamId: TEAM }, projectRoster(TEAM)),
    ])
    await page.route("**/rpc/**", async (route) => {
      if (!route.request().url().includes("teams/update")) return route.fallback()
      sent = route.request().postData() ?? ""
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ json: team(TEAM, ["HEAD_COACH"]) }),
      })
    })

    await visit(page, "team", { id: "team_002" })
    await page.getByTestId("tab-manage").click()
    await page.getByTestId("team-name-input").fill("Triam Udom Girls")
    await page.getByTestId("tab-roster").click()
    await expect(page.getByTestId("team-name-input")).toBeHidden()
    await page.getByTestId("tab-manage").click()
    await expect(page.getByTestId("team-name-input")).toHaveValue("Triam Udom Girls")
    await page.getByTestId("team-save").click()

    await expect.poll(() => sent, { message: "save must reach the server" }).not.toBe("")
    expect(sent).toContain("Triam Udom Girls")
    expect(sent, "the Thai name must survive").toContain(projectTeam(TEAM).names.th!)
  })
})

test.describe("Team tabs", () => {
  test("shows one labelled panel and supports keyboard selection and history", async ({ page }) => {
    await seedCache(page, [
      entry(orpc.teams.get, { id: TEAM }, team(TEAM)),
      entry(orpc.teams.roster, { teamId: TEAM }, projectRoster(TEAM)),
      entry(orpc.games.list, { teamId: TEAM }, { viewerTimezone: null, games: [] }),
    ])
    await visit(page, "team", { id: TEAM })
    await expect(page.getByRole("tabpanel")).toHaveCount(1)
    await expect(page.getByRole("tab", { name: "Roster", selected: true })).toBeVisible()
    await expect(page.getByTestId("team-hero").getByRole("link", { name: /Roster|Schedule/ })).toHaveCount(0)
    await expect(page.getByTestId("tab-manage")).toHaveCount(0)
    await page.getByTestId("tab-roster").focus()
    await page.keyboard.press("ArrowRight")
    await page.keyboard.press("Enter")
    await expect(page.getByRole("tabpanel", { name: "Schedule", exact: true })).toBeVisible()
    await expect(page.getByTestId("roster")).toBeHidden()
    await expect(page).toHaveURL(/tab=schedule/)
    await page.reload()
    await expect(page.getByRole("tab", { name: "Schedule", selected: true })).toBeVisible()
    await page.goBack()
    await expect(page.getByRole("tab", { name: "Roster", selected: true })).toBeVisible()
    await page.goForward()
    await expect(page.getByRole("tab", { name: "Schedule", selected: true })).toBeVisible()
  })

  test("a failed roster can be retried without claiming the squad is empty", async ({ page }) => {
    await seedCache(page, [entry(orpc.teams.get, { id: TEAM }, team(TEAM))])
    await visit(page, "team", { id: TEAM })
    const panel = page.getByRole("tabpanel", { name: "Roster", exact: true })
    await expect(panel.getByRole("button", { name: "Try again" })).toBeVisible()
    await expect(page.getByTestId("roster-empty")).toHaveCount(0)
    await page.route("**/rpc/teams/roster**", route => route.fulfill({
      contentType: "application/json", body: JSON.stringify({ json: projectRoster(TEAM) }),
    }))
    await panel.getByRole("button", { name: "Try again" }).click()
    await expect(page.getByTestId("roster")).toBeVisible()
    await expect(panel.getByRole("button", { name: "Try again" })).toHaveCount(0)
  })

  for (const [query, selected] of [
    ["section=roster", "Roster"], ["section=schedule", "Schedule"],
    ["tab=manage", "Roster"], ["tab=unknown", "Roster"],
    ["tab=roster&section=schedule", "Roster"],
  ]) {
    test(`deep link ${query} selects ${selected}`, async ({ page }) => {
      await seedCache(page, [
        entry(orpc.teams.get, { id: TEAM }, team(TEAM)),
        entry(orpc.teams.roster, { teamId: TEAM }, projectRoster(TEAM)),
        entry(orpc.games.list, { teamId: TEAM }, { viewerTimezone: null, games: [] }),
      ])
      await visit(page, "team", { id: TEAM, query: Object.fromEntries(new URLSearchParams(query)) })
      await expect(page.getByRole("tab", { name: selected, selected: true, exact: true })).toBeVisible()
      await expect(page.getByRole("tabpanel", { name: selected, exact: true })).toBeVisible()
      await expect(page.getByTestId("team-settings")).toHaveCount(0)
      await expect(page.getByTestId("manage-roster")).toHaveCount(0)
    })
  }
})

test.describe("Coaching staff", () => {
  /**
   * `team_coaches` had this from the start and the page never showed it. The
   * server withholds it from a signed-out reader — a roster of children is what
   * a gym wall shows, the adults responsible for them are not — so the page has
   * two empty states that mean different things and must not be confused.
   */
  /**
   * team_001, because it is the seeded team with both a head coach and an
   * assistant — Wichai Srisuk and Pranom Chaiyo, the two roles this asserts.
   * The invented `u1`/`u2` it used to carry named nobody.
   */
  const COACHED = "team_001"
  const withCoaches = projectRoster(COACHED, { signedIn: true })
  const head = withCoaches.coaches.find((c) => c.coachRoleCode === "HEAD")!
  const assistant = withCoaches.coaches.find((c) => c.coachRoleCode === "ASSISTANT")!

  test("names them, with the role in the reader's language", async ({ page }) => {
    await seedCache(page, [
      entry(orpc.teams.get, { id: COACHED }, team(COACHED)),
      entry(orpc.teams.roster, { teamId: COACHED }, withCoaches),
      sessionFor("SPECTATOR"),
    ])
    await visit(page, "team", { id: COACHED })

    await expect(page.getByTestId(`coach-${head.userId}`)).toContainText(head.name)
    // From the reference vocabulary, not a map of role codes in the page.
    await expect(page.getByTestId(`coach-${head.userId}`)).toContainText("Head Coach")
    await expect(page.getByTestId(`coach-${assistant.userId}`)).toContainText("Assistant Coach")
  })

  test("tells a signed-out reader why the list is empty", async ({ page }) => {
    // Not the same as "this team has no coaches", and the page must not say
    // that — it would be stating as fact something it was refused.
    await seedCache(page, [
      entry(orpc.teams.get, { id: TEAM }, team(TEAM)),
      entry(orpc.teams.roster, { teamId: TEAM }, { ...withCoaches, coaches: [] }),
    ])
    await visit(page, "team", { id: "team_002" })

    await expect(page.getByTestId("coaches-signin")).toBeVisible()
    await expect(page.getByTestId("coaches-empty")).toHaveCount(0)
  })

  test("says so when a signed-in reader genuinely sees none", async ({ page }) => {
    await seedCache(page, [
      entry(orpc.teams.get, { id: TEAM }, team(TEAM)),
      entry(orpc.teams.roster, { teamId: TEAM }, { ...withCoaches, coaches: [] }),
      sessionFor("SPECTATOR"),
    ])
    await visit(page, "team", { id: "team_002" })

    await expect(page.getByTestId("coaches-empty")).toBeVisible()
    await expect(page.getByTestId("coaches-signin")).toHaveCount(0)
  })
})
