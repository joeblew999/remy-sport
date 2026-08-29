import { test, expect } from "./fixture"
import { seedCache, entry, orpc } from "../helpers/seed-cache"

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

const event = (canEdit: boolean, canInvite = canEdit) => ({
  id: EVENT_ID,
  name: "Bangkok Schools Basketball League 2026",
  names: { en: "Bangkok Schools Basketball League 2026", th: "ลีกบาสเกตบอลโรงเรียนกรุงเทพ" },
  typeCode: "LEAGUE",
  formatCode: "5x5",
  description: null,
  startDate: "2026-05-01",
  endDate: "2026-09-30",
  cityCode: "BANGKOK",
  provinceCode: "BKK",
  isFibaCertified: false,
  timezone: "Asia/Bangkok",
  orgId: null,
  organizerUserId: "usr_org_002",
  organizerName: "Organiser",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  canEdit,
  canInviteCoOrganizer: canInvite,
})

const seed = (canEdit: boolean, canInvite = canEdit) => [
  entry(orpc.events.get, { id: EVENT_ID }, event(canEdit, canInvite) as never),
  entry(orpc.events.list, undefined as never, { events: [event(canEdit, canInvite)] } as never),
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
    await expect(page.getByTestId("event-name-input")).toHaveValue(event(true).names.en)
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
