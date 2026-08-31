import { test, expect } from "./fixture"
import { seedCache, entry, orpc } from "../helpers/seed-cache"
import { apiEvent } from "../helpers/api-fixtures"

/**
 * The schedule, rendered against seeded games.
 *
 * The one decision this component makes is whether to offer score entry, and it
 * makes it from `canEnterScore` — the server's answer, per game. So the tests
 * seed that field rather than a role: seeding a role would assert a rule the
 * component does not contain.
 */

const base = {
  eventId: "evt_002",
  homeTeamNames: { en: "Assumption U16", th: "อัสสัมชัญ U16" },
  awayTeamNames: { en: "Montfort U16", th: "มงฟอร์ต U16" },
  venueNames: { en: "Assumption Indoor Court" },
  canEnterScore: false,
  canSetStatus: false,
  canAssignReferee: false,
  referees: [],
  availableReferees: [],
}

const finished = { ...base, id: "gam_001", startsAt: "2026-06-10T10:00:00Z", statusCode: "FINISHED", homeScore: 68, awayScore: 54, venueId: "ven_002" }
const upcoming = { ...base, id: "gam_003", startsAt: "2026-09-15T10:00:00Z", statusCode: "SCHEDULED", homeScore: null, awayScore: null, venueId: null, venueNames: null }

/**
 * `canManage` says whether the reader may reschedule or remove a fixture.
 *
 * It is seeded on `events.entries`, not on the game, because MANAGE_FIXTURES is
 * EVENT-scoped — the schedule asks once for the event rather than once per row.
 */
const seed = (
  page: Parameters<typeof seedCache>[0],
  games: unknown[],
  canManage = false,
) =>
  seedCache(page, [
    entry(orpc.events.entries, { eventId: "evt_002" }, {
      registered: [],
      registrable: [],
      // `divisions` is not optional: useEntries maps it, so omitting it made
      // the query throw and the permission silently read false.
      divisions: [],
      canManageFixtures: canManage,
    }),
    entry(orpc.events.get, { id: "evt_002" }, apiEvent({ id: "evt_002", name: "Bangkok Schools League", names: { en: "Bangkok Schools League" }, startDate: "2026-05-01", endDate: "2026-09-30", cityCode: "BANGKOK", provinceCode: "BKK", organizerUserId: "usr_org_002", orgId: null, organizerName: "Niran" })),
    entry(orpc.games.list, { eventId: "evt_002" }, { games }),
  ])

test.describe("An event's schedule", () => {
  test("shows each fixture, its score and its status", async ({ page }) => {
    await seed(page, [finished, upcoming])
    await page.goto("/#/event/evt_002")
    await page.getByRole("button", { name: "Schedule" }).click()

    await expect(page.getByTestId("game-gam_001")).toContainText("Assumption U16")
    await expect(page.getByTestId("score-gam_001")).toHaveText("68–54")
    await expect(page.getByTestId("game-status-gam_001")).toHaveText("Finished")

    // No score yet, and no court assigned — neither is invented.
    await expect(page.getByTestId("score-gam_003")).toHaveText("—")
    await expect(page.getByTestId("game-gam_003")).toContainText("Venue TBC")
  })

  test("offers score entry only where the server says it may", async ({ page }) => {
    await seed(page, [{ ...finished, canEnterScore: true }, upcoming])
    await page.goto("/#/event/evt_002")
    await page.getByRole("button", { name: "Schedule" }).click()

    await expect(page.getByTestId("enter-score-gam_001")).toBeVisible()
    await expect(page.getByTestId("enter-score-gam_003")).toHaveCount(0)
  })

  test("the score form opens with the current score in it", async ({ page }) => {
    await seed(page, [{ ...finished, canEnterScore: true }])
    await page.goto("/#/event/evt_002")
    await page.getByRole("button", { name: "Schedule" }).click()
    await page.getByTestId("enter-score-gam_001").click()

    await expect(page.getByTestId("home-score-gam_001")).toHaveValue("68")
    await expect(page.getByTestId("away-score-gam_001")).toHaveValue("54")
  })

  test("the status becomes a control only for someone who may set it", async ({ page }) => {
    await seed(page, [
      { ...finished, canSetStatus: true },
      upcoming,
    ])
    await page.goto("/#/event/evt_002")
    await page.getByRole("button", { name: "Schedule" }).click()

    // A separate grant from scoring, so a separate control.
    await expect(page.getByTestId("game-status-gam_001")).toHaveRole("combobox")
    await expect(page.getByTestId("game-status-gam_003")).not.toHaveRole("combobox")
  })

  test("says so when an event has no fixtures, rather than showing an empty table", async ({ page }) => {
    await seed(page, [])
    await page.goto("/#/event/evt_002")
    await page.getByRole("button", { name: "Schedule" }).click()

    await expect(page.getByTestId("schedule-empty")).toBeVisible()
    await expect(page.getByTestId("schedule")).toHaveCount(0)
  })
})

/**
 * The league table, from data rather than from a constant.
 *
 * It rendered eight invented schools until 2026-08-27 — Bangkok Christian 5–0,
 * Saint Gabriel's 4–1 — on both the event page and a standalone page whose
 * header was equally made up. Every column is derived from the games now.
 */
test.describe("Standings", () => {
  const line = (over: Record<string, unknown>) => ({
    teamId: "team_001", teamNames: { en: "Assumption U16" },
    divisionId: "div_001", divisionNames: { en: "U16 Boys" },
    rank: 1, played: 1, won: 1, lost: 0,
    pointsFor: 68, pointsAgainst: 54, pointsDiff: 14, leaguePoints: 2,
    ...over,
  })

  const seedStandings = (page: Parameters<typeof seedCache>[0], standings: unknown[]) =>
    seedCache(page, [
      entry(orpc.events.get, { id: "evt_002" }, apiEvent({ id: "evt_002", name: "Bangkok Schools League", names: { en: "Bangkok Schools League" }, startDate: "2026-05-01", endDate: "2026-09-30", cityCode: "BANGKOK", provinceCode: "BKK", organizerUserId: "usr_org_002", orgId: null, organizerName: "Niran" })),
      entry(orpc.standings.list, { eventId: "evt_002" }, { standings }),
    ])

  test("renders the table it was given, with the difference signed", async ({ page }) => {
    await seedStandings(page, [
      line({}),
      line({ teamId: "team_003", teamNames: { en: "Montfort U16" }, rank: 2, won: 0, lost: 1, pointsFor: 54, pointsAgainst: 68, pointsDiff: -14, leaguePoints: 0 }),
    ])
    await page.goto("/#/event/evt_002")
    await page.getByRole("button", { name: "Standings" }).click()

    await expect(page.getByTestId("standing-team_001")).toContainText("Assumption U16")
    // Two points for a win — the PO's STANDINGS_POINTS, not a number here.
    await expect(page.getByTestId("standing-team_001")).toContainText("+14")
    await expect(page.getByTestId("standing-team_003")).toContainText("-14")
  })

  test("a team that has not played shows zeroes, not an absence", async ({ page }) => {
    await seedStandings(page, [
      line({ teamId: "team_004", teamNames: { en: "Assumption U18" }, played: 0, won: 0, lost: 0, pointsFor: 0, pointsAgainst: 0, pointsDiff: 0, leaguePoints: 0 }),
    ])
    await page.goto("/#/event/evt_002")
    await page.getByRole("button", { name: "Standings" }).click()
    await expect(page.getByTestId("standing-team_004")).toBeVisible()
  })

  test("an event with no registrations says so", async ({ page }) => {
    await seedStandings(page, [])
    await page.goto("/#/event/evt_002")
    await page.getByRole("button", { name: "Standings" }).click()
    await expect(page.getByTestId("standings-empty")).toBeVisible()
    await expect(page.getByTestId("standings")).toHaveCount(0)
  })
})

/**
 * The Teams tab. The form appears only when the server offers something to
 * enter — the page never works that out for itself.
 */
test.describe("Event entries", () => {
  const EVENT = apiEvent({ id: "evt_002", name: "Bangkok Schools League", names: { en: "Bangkok Schools League" }, startDate: "2026-05-01", endDate: "2026-09-30", cityCode: "BANGKOK", provinceCode: "BKK", organizerUserId: "usr_org_002", orgId: null, organizerName: "Niran" })
  const U16M = { id: "div_001", names: { en: "U16 Boys" }, ageGroupCode: "U16", genderCode: "M" }
  const U18F = { id: "div_004", names: { en: "U18 Girls" }, ageGroupCode: "U18", genderCode: "F" }

  const seedEntries = (page: Parameters<typeof seedCache>[0], entries: unknown) =>
    seedCache(page, [
      entry(orpc.events.get, { id: "evt_002" }, EVENT),
      entry(orpc.events.entries, { eventId: "evt_002" }, entries),
    ])

  const open = async (page: Parameters<typeof seedCache>[0]) => {
    await page.goto("/#/event/evt_002")
    await page.getByRole("button", { name: "Teams" }).click()
  }

  test("shows who is entered, and no form when there is nothing to enter", async ({ page }) => {
    await seedEntries(page, {
      registered: [{ teamId: "team_001", names: { en: "Assumption U16" }, divisionId: "div_001", divisionNames: { en: "U16 Boys" }, canWithdraw: false }],
      registrable: [],
      divisions: [U16M],
      canManageFixtures: false,
    })
    await open(page)

    await expect(page.getByTestId("entry-team_001")).toContainText("Assumption U16")
    await expect(page.getByTestId("entry-team_001")).toContainText("U16 Boys")
    await expect(page.getByTestId("withdraw-team_001")).toHaveCount(0)
    await expect(page.getByTestId("enter-team")).toHaveCount(0)
  })

  test("offers the form, and only the divisions the chosen team matches", async ({ page }) => {
    await seedEntries(page, {
      registered: [],
      registrable: [{ teamId: "team_004", names: { en: "Assumption U18" }, ageGroupCode: "U18", genderCode: "M" }],
      // Neither division matches a U18 boys' team.
      divisions: [U16M, U18F],
      canManageFixtures: false,
    })
    await open(page)

    await expect(page.getByTestId("enter-team")).toBeVisible()
    // Said plainly, rather than an empty select that submits nothing.
    await expect(page.getByTestId("no-division")).toBeVisible()
    await expect(page.getByTestId("enter-team-submit")).toBeDisabled()
  })

  test("enables entry once a division matches", async ({ page }) => {
    await seedEntries(page, {
      registered: [],
      registrable: [{ teamId: "team_001", names: { en: "Assumption U16" }, ageGroupCode: "U16", genderCode: "M" }],
      divisions: [U16M, U18F],
      canManageFixtures: false,
    })
    await open(page)

    await expect(page.getByTestId("no-division")).toHaveCount(0)
    await expect(page.getByTestId("enter-team-submit")).toBeEnabled()
    // The mismatched one is not offered at all.
    await expect(page.getByTestId("enter-division-select")).not.toContainText("U18 Girls")
  })

  test("a withdraw button appears only where the server allows it", async ({ page }) => {
    await seedEntries(page, {
      registered: [
        { teamId: "team_001", names: { en: "Mine" }, divisionId: "div_001", divisionNames: { en: "U16 Boys" }, canWithdraw: true },
        { teamId: "team_003", names: { en: "Theirs" }, divisionId: "div_001", divisionNames: { en: "U16 Boys" }, canWithdraw: false },
      ],
      registrable: [],
      divisions: [U16M],
      canManageFixtures: false,
    })
    await open(page)

    await expect(page.getByTestId("withdraw-team_001")).toBeVisible()
    await expect(page.getByTestId("withdraw-team_003")).toHaveCount(0)
  })
})

/**
 * The organiser's half of the schedule: adding a fixture and choosing who
 * officiates. Both appear on the server's word and never on a role.
 */
test.describe("Running a schedule", () => {
  const EV = apiEvent({ id: "evt_002", name: "Bangkok Schools League", names: { en: "Bangkok Schools League" }, startDate: "2026-05-01", endDate: "2026-09-30", cityCode: "BANGKOK", provinceCode: "BKK", organizerUserId: "usr_org_002", orgId: null, organizerName: "Niran" })
  const two = [
    { teamId: "team_001", names: { en: "A" }, divisionId: "div_001", divisionNames: { en: "U16 Boys" }, canWithdraw: false },
    { teamId: "team_003", names: { en: "B" }, divisionId: "div_001", divisionNames: { en: "U16 Boys" }, canWithdraw: false },
  ]

  const show = async (
    page: Parameters<typeof seedCache>[0],
    opts: { canManageFixtures: boolean; game?: Record<string, unknown> },
  ) => {
    await seedCache(page, [
      entry(orpc.events.get, { id: "evt_002" }, EV),
      entry(orpc.events.entries, { eventId: "evt_002" }, {
        registered: two, registrable: [], divisions: [], canManageFixtures: opts.canManageFixtures,
      }),
      entry(orpc.games.list, { eventId: "evt_002" }, {
        games: [{ ...finished, ...(opts.game ?? {}) }],
      }),
    ])
    await page.goto("/#/event/evt_002")
    await page.getByTestId("tab-schedule").click()
  }

  // One seed per test: seedCache installs an init script, and re-seeding inside
  // a test stacks a second one whose ordering is not worth relying on.
  test("no fixture form for someone who may not add one, however many teams", async ({ page }) => {
    await show(page, { canManageFixtures: false })
    await expect(page.getByTestId("schedule")).toBeVisible()
    await expect(page.getByTestId("add-fixture")).toHaveCount(0)
  })

  test("the organiser gets it", async ({ page }) => {
    await show(page, { canManageFixtures: true })
    await expect(page.getByTestId("add-fixture")).toBeVisible()
  })

  test("a referee's name is shown to everyone — that is what makes it accountable", async ({ page }) => {
    await show(page, {
      canManageFixtures: false,
      game: { referees: [{ userId: "usr_referee_001", name: "Adisorn Boonchai" }] },
    })
    await expect(page.getByTestId("referees-gam_001")).toContainText("Adisorn Boonchai")
    await expect(page.getByTestId("assign-referee-gam_001")).toHaveCount(0)
  })

  test("and only the organiser can change it", async ({ page }) => {
    await show(page, {
      canManageFixtures: true,
      game: {
        referees: [{ userId: "usr_referee_001", name: "Adisorn Boonchai" }],
        canAssignReferee: true,
        availableReferees: [{ userId: "usr_referee_002", name: "Waraporn Jaingam" }],
      },
    })
    await expect(page.getByTestId("unassign-gam_001-usr_referee_001")).toBeVisible()
    await expect(page.getByTestId("referee-select-gam_001")).toContainText("Waraporn")
  })
})

test.describe("Rescheduling and removing a fixture", () => {
  /**
   * `games.update` and `games.remove` were both enforced by MANAGE_FIXTURES and
   * both unreachable from the app, so a fixture entered at the wrong time
   * stayed at the wrong time and a mistake could never be taken back.
   *
   * The controls are gated on `canManageFixture` — the server's answer for this
   * reader on this game's event — for the same reason score entry is: a rule in
   * the client could only ever be right by accident.
   */
  /**
 *  is gone from the game — MANAGE_FIXTURES is EVENT-scoped,
 * so the answer was the same value once per row. The schedule asks the event
 * once, through `events.entries`, and passes it down.
 */
const managed = { ...upcoming, timezone: "Asia/Bangkok" }

  test("offers nothing to a reader who may not manage fixtures", async ({ page }) => {
    await seed(page, [upcoming])
    await page.goto("/#/event/evt_002")
    await page.getByRole("button", { name: "Schedule" }).click()

    await expect(page.getByTestId("game-gam_003")).toBeVisible()
    await expect(page.getByTestId("edit-fixture-gam_003")).toHaveCount(0)
    await expect(page.getByTestId("remove-fixture-gam_003")).toHaveCount(0)
  })

  test("prefills the time on the venue's clock, not the machine's", async ({ page }) => {
    // The bug this guards is silent: 10:00 UTC is 17:00 in Bangkok, and a form
    // that showed 10:00 would have an organiser change nothing, press Save, and
    // move the game seven hours. Nothing errors; people just turn up wrong.
    await seed(page, [managed], true)
    await page.goto("/#/event/evt_002")
    await page.getByRole("button", { name: "Schedule" }).click()
    await page.getByTestId("edit-fixture-gam_003").click()

    await expect(page.getByTestId("fixture-when-gam_003")).toHaveValue("2026-09-15T17:00")
  })

  test("sends back a UTC instant, whatever the box showed", async ({ page }) => {
    let sent = ""
    await seed(page, [managed], true)
    await page.route("**/rpc/**", async (route) => {
      const url = route.request().url()
      if (!url.includes("games/update")) return route.fallback()
      sent = route.request().postData() ?? ""
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ json: managed }),
      })
    })

    await page.goto("/#/event/evt_002")
    await page.getByRole("button", { name: "Schedule" }).click()
    await page.getByTestId("edit-fixture-gam_003").click()
    await page.getByTestId("fixture-when-gam_003").fill("2026-09-15T19:30")
    await page.getByTestId("save-fixture-gam_003").click()

    await expect.poll(() => sent, { message: "save must reach the server" }).not.toBe("")
    // 19:30 in Bangkok is 12:30 UTC. Storing the wall clock would be the same
    // bug the prefill test guards, in the other direction.
    expect(sent).toContain("2026-09-15T12:30:00.000Z")
  })

  test("asks before removing, because the referees go with it", async ({ page }) => {
    await seed(page, [managed], true)
    let asked = ""
    page.on("dialog", (d) => {
      asked = d.message()
      void d.dismiss()
    })
    await page.goto("/#/event/evt_002")
    await page.getByRole("button", { name: "Schedule" }).click()
    await page.getByTestId("remove-fixture-gam_003").click()

    // Dismissed, so the fixture is still there. A delete that fires on the
    // first click cannot be taken back — the model keeps no deleted state.
    await expect.poll(() => asked).toContain("Remove this fixture")
    await expect(page.getByTestId("game-gam_003")).toBeVisible()
  })
})
