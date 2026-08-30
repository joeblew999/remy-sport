import { test, expect } from "./fixture"
import { seedCache, entry, orpc } from "../helpers/seed-cache"
import { apiEvent } from "../helpers/api-fixtures"

/**
 * Editing an event, and who is offered the chance.
 *
 * `events.update` was enforced by `EDIT_EVENT` from the day events existed and
 * nothing in the app could call it, so an organiser could create a tournament
 * and never fix a typo in its name. The tab is the fix; `canEdit` is what
 * decides who sees it.
 *
 * That second part is the one worth testing hardest. Showing the tab to
 * everybody and answering 403 when Save is pressed is the failure mode this
 * codebase keeps coming back to — it is indistinguishable, to the person
 * pressing it, from the app being broken.
 */

const EVENT_ID = "evt_002"

const event = (canEdit: boolean, canInvite = canEdit) =>
  apiEvent({ id: EVENT_ID, organizerName: "Organiser", canEdit, canInviteCoOrganizer: canInvite })

const seed = (canEdit: boolean, canInvite = canEdit) => [
  entry(orpc.events.get, { id: EVENT_ID }, event(canEdit, canInvite)),
  entry(orpc.events.list, undefined, { events: [event(canEdit, canInvite)] } as never),
]

test.describe("An event's settings tab", () => {
  test("is not offered to someone who may not edit", async ({ page }) => {
    await seedCache(page, seed(false))
    await page.goto(`/#/event/${EVENT_ID}`)

    await expect(page.getByTestId("tab-overview")).toBeVisible()
    await expect(page.getByTestId("tab-settings")).toHaveCount(0)
  })

  test("is offered to an organiser, prefilled with what is stored", async ({ page }) => {
    await seedCache(page, seed(true))
    await page.goto(`/#/event/${EVENT_ID}`)
    await page.getByTestId("tab-settings").click()

    await expect(page.getByTestId("event-settings")).toBeVisible()
    // Prefilled, not blank. A form that starts empty invites someone to save a
    // partial record over a complete one.
    await expect(page.getByTestId("event-name-input")).toHaveValue(event(true).names.en!)
    await expect(page.getByTestId("event-start-input")).toHaveValue("2026-05-01")
    await expect(page.getByTestId("event-end-input")).toHaveValue("2026-09-30")
  })

  test("keeps the other languages when saving the English name", async ({ page }) => {
    // The failure this catches is silent and permanent: sending `{ en }` alone
    // would delete the Thai and Japanese names on the first save, and nobody
    // reading an English page would ever notice.
    let sent = ""
    await seedCache(page, seed(true))
    await page.route("**/rpc/**", async (route) => {
      const url = route.request().url()
      if (!url.includes("events/update")) return route.fallback()
      sent = route.request().postData() ?? ""
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ json: event(true) }),
      })
    })

    await page.goto(`/#/event/${EVENT_ID}`)
    await page.getByTestId("tab-settings").click()
    await page.getByTestId("event-name-input").fill("Bangkok Schools League 2026")
    await page.getByTestId("event-save").click()

    await expect.poll(() => sent, { message: "save must reach the server" }).not.toBe("")
    expect(sent, "the edited name").toContain("Bangkok Schools League 2026")
    expect(sent, "the Thai name must survive").toContain("ลีกบาสเกตบอลโรงเรียนกรุงเทพ")
  })

  test("says what is wrong when the API refuses the dates", async ({ page }) => {
    // BAD_DATE_RANGE is a defined error, so the sentence comes from the code by
    // convention — err_bad_date_range — rather than from a table in the client.
    await seedCache(page, seed(true))
    await page.route("**/rpc/**", async (route) => {
      const url = route.request().url()
      if (!url.includes("events/update")) return route.fallback()
      return route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          json: { defined: true, code: "BAD_DATE_RANGE", status: 400, message: "Bad date range" },
        }),
      })
    })

    await page.goto(`/#/event/${EVENT_ID}`)
    await page.getByTestId("tab-settings").click()
    await page.getByTestId("event-end-input").fill("2026-01-01")
    await page.getByTestId("event-save").click()

    // The reader must be told. A refused save that changes nothing on screen is
    // worse than a generic banner — see lib/form-errors.ts.
    await expect(page.getByTestId("event-settings-error")).toBeVisible()
    await expect(page.getByTestId("event-settings-error")).toContainText("end date")
  })

  test("offers the invite form to an owner", async ({ page }) => {
    await seedCache(page, seed(true))
    await page.goto(`/#/event/${EVENT_ID}`)
    await page.getByTestId("tab-settings").click()

    await expect(page.getByTestId("invite-co-organizer")).toBeVisible()
    await expect(page.getByTestId("invite-email-input")).toBeVisible()
  })

  test("withholds it from a co-organiser, who may edit but may not recruit", async ({ page }) => {
    /**
     * The distinction this flag exists for. EDIT_EVENT is granted to OWNER,
     * CO_ORGANIZER and PLATFORM_ADMIN; INVITE_CO_ORGANIZER only to OWNER and
     * PLATFORM_ADMIN — deciding who else runs your tournament is not something
     * you delegate by having been delegated to.
     *
     * Reusing `canEdit` here would have shown a form that answers 403, and the
     * two flags agree for an owner, so nothing else in the suite would notice.
     */
    await seedCache(page, seed(true, false))
    await page.goto(`/#/event/${EVENT_ID}`)
    await page.getByTestId("tab-settings").click()

    await expect(page.getByTestId("event-settings")).toBeVisible()
    await expect(page.getByTestId("invite-co-organizer")).toHaveCount(0)
  })

  test("invites by email, because nobody knows a user id", async ({ page }) => {
    let sent = ""
    await seedCache(page, seed(true))
    await page.route("**/rpc/**", async (route) => {
      if (!route.request().url().includes("addCoOrganizer")) return route.fallback()
      sent = route.request().postData() ?? ""
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          json: { eventId: EVENT_ID, userId: "usr_org_001", addedAt: "2026-08-29" },
        }),
      })
    })

    await page.goto(`/#/event/${EVENT_ID}`)
    await page.getByTestId("tab-settings").click()
    await page.getByTestId("invite-email-input").fill("niran.k@bat.test")
    await page.getByTestId("invite-send").click()

    await expect.poll(() => sent, { message: "invite must reach the server" }).not.toBe("")
    expect(sent).toContain("niran.k@bat.test")
    await expect(page.getByTestId("invite-sent")).toBeVisible()
  })
})

test.describe("The event hero's actions", () => {
  /**
   * Three of the four did nothing at all: Register team, Add to calendar and
   * Share were `<button className="btn">` with no handler, sitting beside a
   * Follow button that worked. A dead control is worse than no control —
   * pressing it and getting nothing reads as the app being broken, and it
   * teaches people to stop trusting the ones that do work.
   */
  test("Register team goes to the tab where registration actually lives", async ({ page }) => {
    // It was a second button for a feature that already exists in full on the
    // Teams tab, and it did not go there.
    await seedCache(page, [
      entry(
        orpc.events.get,
        { id: EVENT_ID },
        { ...event(false), startDate: "2026-01-01", endDate: "2026-12-31" } as never,
      ),
    ])
    await page.goto(`/#/event/${EVENT_ID}`)

    await page.getByTestId("hero-register").click()
    await expect(page.getByTestId("tab-teams")).toHaveClass(/active/)
  })

  test("offers a calendar file only when there is a date to put in one", async ({ page }) => {
    // An event can exist before its dates are fixed. A file with today's date
    // would put a wrong entry in somebody's diary, which is worse than no
    // button — see tests/unit/calendar.test.ts.
    await seedCache(page, [
      entry(orpc.events.get, { id: EVENT_ID }, { ...event(false), startDate: null, endDate: null } as never),
    ])
    await page.goto(`/#/event/${EVENT_ID}`)
    await expect(page.getByTestId("add-to-calendar")).toHaveCount(0)
  })

  test("downloads a real .ics when it does", async ({ page }) => {
    await seedCache(page, seed(false))
    await page.goto(`/#/event/${EVENT_ID}`)

    const download = page.waitForEvent("download")
    await page.getByTestId("add-to-calendar").click()
    const file = await download
    expect(file.suggestedFilename()).toBe(`${EVENT_ID}.ics`)
  })

  test("copies the link and says so, where the browser has no share sheet", async ({ page }) => {
    // A copy with no feedback is indistinguishable from a button that does
    // nothing, which is exactly what this replaced.
    await page.addInitScript(() => {
      // Force the fallback. Chromium exposes `navigator.share` here even
      // without a share sheet behind it, so leaving it in place tests the
      // branch that opens a system dialog rather than the one being asserted.
      Object.defineProperty(navigator, "share", { configurable: true, value: undefined })
      let copied = ""
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: async (t: string) => void (copied = t) },
      })
      ;(window as unknown as { __copied: () => string }).__copied = () => copied
    })
    await seedCache(page, seed(false))
    await page.goto(`/#/event/${EVENT_ID}`)
    await page.getByTestId("share").click()

    await expect(page.getByTestId("share")).toContainText("Link copied")
    expect(await page.evaluate(() => (window as unknown as { __copied: () => string }).__copied())).toContain(
      `#/event/${EVENT_ID}`,
    )
  })
})

test.describe("The Venues tab", () => {
  /**
   * It rendered "not built yet" while `event_venues` and `venues` had both been
   * seeded since the fixtures were written — the address, the city, and which
   * court is the main one. Nothing needed building; the page never asked.
   */
  const venues = {
    items: [
      { id: "ven_001", names: { en: "Nimibutr Stadium" }, address: "154 Rama I Rd", cityCode: "BANGKOK", provinceCode: "BKK" },
      { id: "ven_002", names: { en: "Assumption Indoor Court" }, address: "23 Charoen Krung", cityCode: "BANGKOK", provinceCode: "BKK" },
      { id: "ven_009", names: { en: "Somewhere Else" }, address: "1 Elsewhere", cityCode: "CHIANG_MAI", provinceCode: "CMI" },
    ],
  }
  const links = {
    items: [
      { eventId: EVENT_ID, venueId: "ven_002", isPrimary: false },
      { eventId: EVENT_ID, venueId: "ven_001", isPrimary: true },
      { eventId: "evt_999", venueId: "ven_009", isPrimary: true },
    ],
  }

  const seedVenues = (page: Parameters<typeof seedCache>[0]) =>
    seedCache(page, [
      ...seed(false),
      entry(orpc.venues.list, undefined, venues as never),
      entry(orpc.eventVenues.list, undefined, links as never),
    ])

  test("lists this event's venues with their address, and nobody else's", async ({ page }) => {
    await seedVenues(page)
    await page.goto(`/#/event/${EVENT_ID}`)
    await page.getByTestId("tab-venues").click()

    await expect(page.getByTestId("venue-ven_001")).toContainText("Nimibutr Stadium")
    await expect(page.getByTestId("venue-ven_001")).toContainText("154 Rama I Rd")
    await expect(page.getByTestId("venue-ven_002")).toBeVisible()
    // Linked to another event entirely.
    await expect(page.getByTestId("venue-ven_009")).toHaveCount(0)
  })

  test("puts the main court first and marks it", async ({ page }) => {
    // It is the one printed on a fixture list and the one somebody asks for
    // directions to, so a stable order is not cosmetic.
    await seedVenues(page)
    await page.goto(`/#/event/${EVENT_ID}`)
    await page.getByTestId("tab-venues").click()

    await expect(page.getByTestId("venue-primary-ven_001")).toBeVisible()
    await expect(page.getByTestId("venue-primary-ven_002")).toHaveCount(0)
    const order = await page.getByTestId("event-venues").locator(".venue-row").allTextContents()
    expect(order[0]).toContain("Nimibutr Stadium")
  })

  test("says so when an event has none, rather than 'not built yet'", async ({ page }) => {
    await seedCache(page, [
      ...seed(false),
      entry(orpc.venues.list, undefined, venues as never),
      entry(orpc.eventVenues.list, undefined, { items: [] } as never),
    ])
    await page.goto(`/#/event/${EVENT_ID}`)
    await page.getByTestId("tab-venues").click()

    await expect(page.getByTestId("event-venues-empty")).toBeVisible()
  })
})

test.describe("The Rules tab", () => {
  /**
   * It said "not built yet" while three columns on `event` said exactly this
   * and were rendered nowhere at all: the format, whether the event is FIBA
   * certified, and what the organiser wrote about their own tournament.
   */
  test("shows the format and certification from the event itself", async ({ page }) => {
    await seedCache(page, [
      entry(
        orpc.events.get,
        { id: EVENT_ID },
        apiEvent({ id: EVENT_ID, formatCode: "3x3", isFibaCertified: true }),
      ),
    ])
    await page.goto(`/#/event/${EVENT_ID}`)
    await page.getByTestId("tab-rules").click()

    // From the reference vocabulary, so "3x3" and "5-on-5" are rows in the
    // model rather than strings in a component.
    await expect(page.getByTestId("event-format")).toHaveText("3x3")
    await expect(page.getByTestId("event-fiba")).toHaveText("Yes")
  })

  test("says No rather than nothing for an uncertified event", async ({ page }) => {
    // Most school tournaments are not certified. Omitting the row would read as
    // "we did not check", which is a different claim.
    await seedCache(page, [
      entry(orpc.events.get, { id: EVENT_ID }, apiEvent({ id: EVENT_ID, isFibaCertified: false })),
    ])
    await page.goto(`/#/event/${EVENT_ID}`)
    await page.getByTestId("tab-rules").click()

    await expect(page.getByTestId("event-fiba")).toHaveText("No")
  })

  test("renders the organiser's own description, and says when there is none", async ({ page }) => {
    await seedCache(page, [
      entry(
        orpc.events.get,
        { id: EVENT_ID },
        apiEvent({ id: EVENT_ID, description: "Round-robin group stage, then knockouts." }),
      ),
    ])
    await page.goto(`/#/event/${EVENT_ID}`)
    await page.getByTestId("tab-rules").click()
    await expect(page.getByTestId("event-description")).toContainText("Round-robin group stage")

    await seedCache(page, [
      entry(orpc.events.get, { id: EVENT_ID }, apiEvent({ id: EVENT_ID, description: null })),
    ])
    await page.goto(`/#/event/${EVENT_ID}`)
    await page.getByTestId("tab-rules").click()
    await expect(page.getByTestId("event-no-details")).toBeVisible()
  })
})
