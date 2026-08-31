import { test, expect } from "./fixture"
import { seedCache, entry, orpc } from "../helpers/seed-cache"
import { apiEvent } from "../helpers/api-fixtures"

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
 */

const SESSIONS = [
  {
    id: "ses_1",
    eventId: "evt_003",
    venueId: null,
    venueNames: null,
    names: { en: "Shooting fundamentals" },
    startsAt: "2026-07-06T09:00:00.000Z",
    endsAt: "2026-07-06T11:00:00.000Z",
    // The venue's clock. 09:00 UTC is 16:00 in Bangkok, and that is what a
    // parent collecting their child needs to read — not their own zone.
    timezone: "Asia/Bangkok",
  },
]

const seed = (page: Parameters<typeof seedCache>[0], opts: { canDefine: boolean; sessions?: typeof SESSIONS }) =>
  seedCache(page, [
    entry(orpc.events.get, { id: "evt_003" }, apiEvent({
      id: "evt_003",
      name: "Bangkok Skills Camp",
      names: { en: "Bangkok Skills Camp" },
      typeCode: "CAMP",
    })),
    entry(orpc.events.sessions, { eventId: "evt_003" }, {
      sessions: opts.sessions ?? SESSIONS,
      canDefine: opts.canDefine,
    }),
  ])

const open = async (page: Parameters<typeof seedCache>[0]) => {
  await page.goto("/#/event/evt_003")
  await page.getByTestId("tab-sessions").click()
}

test.describe("A camp's sessions", () => {
  test("shows the timetable to anybody, with when and what", async ({ page }) => {
    // Public: a parent reads it before deciding whether to enter their child.
    await seed(page, { canDefine: false })
    await open(page)

    const row = page.getByTestId("session-ses_1")
    await expect(row).toContainText("Shooting fundamentals")
    // On the venue's clock, not the reader's: 09:00 UTC is 16:00 in Bangkok.
    // Rendering the browser's zone would tell a parent in London to arrive five
    // hours early.
    await expect(row).toContainText("04:00 PM")
    await expect(row).toContainText("06:00 PM")
    // The day is named once, not once per time.
    // The day is named once, not once per time — `formatTimeOn` carries a date
    // with it, and using it for both ends read "Jul 6 at 04:00 PM – Jul 6 at
    // 06:00 PM". Case-insensitive because the row is uppercased in CSS, which
    // is not what this asserts.
    expect((await row.innerText()).match(/jul 6/gi)?.length).toBe(1)
  })

  test("offers the form only to somebody the server says may define it", async ({ page }) => {
    await seed(page, { canDefine: false })
    await open(page)
    await expect(page.getByTestId("add-session")).toHaveCount(0)
    await expect(page.getByTestId("remove-session-ses_1")).toHaveCount(0)

    await seed(page, { canDefine: true })
    await open(page)
    await expect(page.getByTestId("add-session")).toBeVisible()
    await expect(page.getByTestId("remove-session-ses_1")).toBeVisible()
  })

  test("says so when the timetable is empty rather than showing nothing", async ({ page }) => {
    await seed(page, { canDefine: true, sessions: [] })
    await open(page)
    await expect(page.getByTestId("sessions-none")).toBeVisible()
    // ...and still offers the way to fill it, which is the whole point.
    await expect(page.getByTestId("add-session")).toBeVisible()
  })

  test("sends UTC instants, whatever the local boxes showed", async ({ page }) => {
    await seed(page, { canDefine: true, sessions: [] })

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

  test("is not offered on a league, which has fixtures instead", async ({ page }) => {
    await seedCache(page, [
      entry(orpc.events.get, { id: "evt_002" }, apiEvent({
        id: "evt_002",
        name: "League",
        names: { en: "League" },
        typeCode: "LEAGUE",
      })),
    ])
    await page.goto("/#/event/evt_002")
    await expect(page.getByTestId("tab-sessions")).toHaveCount(0)
  })
})
