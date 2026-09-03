import { test, expect } from "./fixture"
import { visit } from "../helpers/surfaces"
import { seedCache, entry, orpc } from "../helpers/seed-cache"
import { apiEvent } from "../helpers/api-fixtures"
import { projectAttendance, projectEvent, projectSessions } from "../helpers/projections"

/**
 * A camp's timetable.
 *
 * A camp trains rather than competes, so it has sessions where a league has
 * fixtures — and until 2026-08-31 it had neither: `DEFINE_SESSION_SCHEDULE` had
 * no endpoint, so an organiser could create a camp, watch children register, and
 * had no way to say when to turn up.
 *
 * What is worth asserting is the one decision the page makes: it offers the form
 * to whoever the server says may define the schedule, and to nobody else. A
 * coach is the interesting case — the model gives them RECORD_ATTENDANCE and
 * withholds the timetable.
 *
 * ## This spec used to describe a camp that does not exist
 *
 * It invented a session called `ses_1` at an event it called "Bangkok Skills
 * Camp". The seed's camp is `evt_003`, "Chiang Mai Summer Basketball Camp
 * 2026", and until 2026-09-03 it had **no sessions at all** — so the tab this
 * file covers shipped empty while every test here passed. The invented payload
 * was what let that happen: a page drawn from data no database held cannot tell
 * you the database is empty.
 *
 * It reads the seed now, through `tests/helpers/projections.ts`. There is
 * nowhere left to type a name the fixtures do not have.
 */

const CAMP = "evt_003"

/** The camp's real first session: ball handling, 09:00–11:30 Bangkok time. */
const FIRST = projectSessions(CAMP).sessions[0]!

const seed = (
  page: Parameters<typeof seedCache>[0],
  opts: { canDefine: boolean; empty?: boolean },
) =>
  seedCache(page, [
    entry(orpc.events.get, { id: CAMP }, projectEvent(CAMP)),
    entry(
      orpc.events.sessions,
      { eventId: CAMP },
      opts.empty
        ? { sessions: [], canDefine: opts.canDefine }
        : projectSessions(CAMP, { canDefine: opts.canDefine }),
    ),
  ])

const open = async (page: Parameters<typeof seedCache>[0]) => {
  await visit(page, "event", { id: CAMP })
  await page.getByTestId("tab-sessions").click()
}

test.describe("A camp's sessions", () => {
  test("shows the timetable to anybody, with when and what", async ({ page }) => {
    // Public: a parent reads it before deciding whether to enter their child.
    await seed(page, { canDefine: false })
    await open(page)

    const row = page.getByTestId(`session-${FIRST.id}`)
    await expect(row).toContainText(FIRST.names.en!)
    /**
     * On the venue's clock, not the reader's.
     *
     * The camp starts at 02:00Z, which is 09:00 in Bangkok — and 09:00 is what
     * a parent dropping a child off needs to read. Rendering the browser's zone
     * would tell a parent in London to arrive seven hours early.
     */
    await expect(row).toContainText("09:00 AM")
    await expect(row).toContainText("11:30 AM")
    // The day is named once, not once per time — `formatTimeOn` carries a date
    // with it, and using it for both ends read "Apr 15 at 09:00 AM – Apr 15 at
    // 11:30 AM". Case-insensitive because the row is uppercased in CSS, which
    // is not what this asserts.
    expect((await row.innerText()).match(/apr 15/gi)?.length).toBe(1)
  })

  test("names every session the camp runs, not just the first", async ({ page }) => {
    // Derived, so growing the camp's timetable does not edit this test.
    await seed(page, { canDefine: false })
    await open(page)
    for (const session of projectSessions(CAMP).sessions) {
      await expect(page.getByTestId(`session-${session.id}`)).toContainText(session.names.en!)
    }
  })

  test("says 'Venue TBC' for the session whose court is not decided", async ({ page }) => {
    // The closing afternoon has no venue: it is settled in the week. A column
    // every row fills is one whose empty branch has never rendered.
    const tbc = projectSessions(CAMP).sessions.find((s) => s.venueId === null)!
    await seed(page, { canDefine: false })
    await open(page)
    await expect(page.getByTestId(`session-${tbc.id}`)).not.toContainText("700th Anniversary")
  })

  test("offers the form only to somebody the server says may define it", async ({ page }) => {
    await seed(page, { canDefine: false })
    await open(page)
    await expect(page.getByTestId("add-session")).toHaveCount(0)
    await expect(page.getByTestId(`remove-session-${FIRST.id}`)).toHaveCount(0)

    await seed(page, { canDefine: true })
    await open(page)
    await expect(page.getByTestId("add-session")).toBeVisible()
    await expect(page.getByTestId(`remove-session-${FIRST.id}`)).toBeVisible()
  })

  test("says so when the timetable is empty rather than showing nothing", async ({ page }) => {
    await seed(page, { canDefine: true, empty: true })
    await open(page)
    await expect(page.getByTestId("sessions-none")).toBeVisible()
    // ...and still offers the way to fill it, which is the whole point.
    await expect(page.getByTestId("add-session")).toBeVisible()
  })

  test("sends UTC instants, whatever the local boxes showed", async ({ page }) => {
    await seed(page, { canDefine: true, empty: true })

    let sent = ""
    await page.route("**/rpc/**", async (route) => {
      if (!route.request().url().includes("addSession")) return route.fallback()
      sent = route.request().postData() ?? ""
      await route.fulfill({ status: 201, contentType: "application/json", body: "{}" })
    })

    await open(page)
    await page.getByTestId("session-name").fill("Defence")
    await page.getByTestId("session-start").fill("2026-07-06T09:00")
    await page.getByTestId("session-end").fill("2026-07-06T11:00")
    await page.getByTestId("session-save").click()

    await expect.poll(() => sent).toContain("Defence")
    // `datetime-local` has no zone; the row stores UTC.
    expect(sent).toContain("Z")
  })

  /**
   * The register, on the session a child actually missed.
   *
   * `ses_002` is the second morning and `ply_006` is not on it — the only reason
   * the unticked branch has data at all. A register whose every row says yes has
   * not been tested, which is why the fixtures were written with an absence in
   * them rather than a full house.
   */
  const REGISTER = projectSessions(CAMP).sessions[1]!

  test("opens a register showing everyone entered, ticked or not", async ({ page }) => {
    // A register with only the present children on it is a list. Whoever is
    // holding it needs to see who is missing.
    const attendance = projectAttendance(CAMP, REGISTER.id, { canRecord: true })
    const present = attendance.players.find((p) => p.attended)!
    const absent = attendance.players.find((p) => !p.attended)!

    await seedCache(page, [
      entry(orpc.events.get, { id: CAMP }, projectEvent(CAMP)),
      entry(orpc.events.sessions, { eventId: CAMP }, projectSessions(CAMP, { canDefine: true })),
      entry(orpc.events.attendance, { eventId: CAMP, sessionId: REGISTER.id }, attendance),
    ])
    await open(page)
    await page.getByTestId(`register-${REGISTER.id}`).click()

    await expect(page.getByTestId(`attended-${present.playerId}`)).toBeChecked()
    await expect(page.getByTestId(`attended-${absent.playerId}`)).not.toBeChecked()
    await expect(page.getByTestId(`attended-${absent.playerId}`)).toBeEnabled()
  })

  test("shows the register read-only to somebody who may not record", async ({ page }) => {
    // canRecord is the server's answer and is wider than canDefine — the model
    // gives a camp's coaches the register and withholds the timetable.
    const attendance = projectAttendance(CAMP, REGISTER.id, { canRecord: false })
    await seedCache(page, [
      entry(orpc.events.get, { id: CAMP }, projectEvent(CAMP)),
      entry(orpc.events.sessions, { eventId: CAMP }, projectSessions(CAMP, { canDefine: false })),
      entry(orpc.events.attendance, { eventId: CAMP, sessionId: REGISTER.id }, attendance),
    ])
    await open(page)
    await page.getByTestId(`register-${REGISTER.id}`).click()
    await expect(
      page.getByTestId(`attended-${attendance.players[0]!.playerId}`),
    ).toBeDisabled()
  })

  test("is not offered on a league, which has fixtures instead", async ({ page }) => {
    // evt_002 is the seeded league. apiEvent rather than a projection because
    // what this asserts is the *absence* of a tab, and a league's real payload
    // would drag in 28 games' worth of facts to prove nothing extra.
    await seedCache(page, [
      entry(orpc.events.get, { id: "evt_002" }, apiEvent({ id: "evt_002", typeCode: "LEAGUE" })),
    ])
    await visit(page, "event", { id: "evt_002" })
    await expect(page.getByTestId("tab-sessions")).toHaveCount(0)
  })
})
