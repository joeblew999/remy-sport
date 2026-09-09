import { test, expect } from "./fixture"
import { sessionFor } from "../helpers/actors"
import { visit } from "../helpers/surfaces"
import { seedCache, entry, orpc } from "../helpers/seed-cache"
import { m } from "../../src/web/lib/i18n"
import { SEED_ENTITIES } from "../../src/domain/model/entities"

/**
 * Meetings, as a reader sees them.
 *
 * The feature shipped on 2026-09-09 with no rendering check at all — step 6 of
 * docs/2026-09-09-13-meetings.md, "Proof", was never done. What that cost was
 * visible immediately: the button that invites your colleagues to a meeting
 * said **"Create test room"**, borrowed from the dev-only two-seat media
 * experiment, and it said it in three languages. Every other check was green,
 * because every other check asks whether a string exists and is translated, not
 * what it says on the screen it is on.
 *
 * So this tier owns the questions a person would have answered by looking: what
 * the control is called, that the list of every account on the platform can
 * actually be searched, and that the room says something true when the meeting
 * is not yours. That the *copy* stays out of the experiment's namespace is
 * mechanised separately, in tests/repo/copy-surfaces.test.ts.
 */

const me = SEED_ENTITIES.users.find((u) => u.id === "usr_coach_001")!
const signedIn = sessionFor("COACH")

/**
 * Everybody else, which is literally what `meetings.people` returns.
 *
 * The Product Owner's instruction is that anyone may invite anyone, so the
 * picker's input is the whole user table. Twelve rows is not a thousand, but it
 * is the same shape, and the reason the control has to filter at all.
 */
const people = SEED_ENTITIES.users
  .filter((u) => u.id !== me.id)
  .map((u) => ({ id: u.id, name: u.names?.en ?? u.email }))

const niran = people.find((p) => p.id === "usr_org_002")!

/** One meeting somebody has asked you to, and one you are already in. */
const asked = {
  id: "mtg_001",
  title: "Coaches catch-up",
  createdBy: "usr_org_002",
  createdByName: niran.name,
  startsAt: null as string | null,
  myStatusCode: "INVITED" as const,
  participants: [
    { userId: "usr_org_002", name: niran.name, statusCode: "ACCEPTED" as const },
    { userId: me.id, name: me.names.en, statusCode: "INVITED" as const },
  ],
}
const yours = { ...asked, id: "mtg_002", title: "Squad selection", myStatusCode: "ACCEPTED" as const }

const seed = (page: Parameters<typeof seedCache>[0], meetings = [asked, yours]) =>
  seedCache(page, [
    signedIn,
    entry(orpc.meetings.mine, undefined, { meetings }),
    entry(orpc.people.list, undefined, { people }),
  ])

test.describe("The list", () => {
  test("separates what is being asked of you from what you are already in", async ({ page }) => {
    await seed(page)
    await visit(page, "meetings")

    // Two lists because they are two questions — one needs an answer from you.
    await expect(page.getByTestId("meeting-invitations")).toContainText(asked.title)
    await expect(page.getByTestId("meeting-yours")).toContainText(yours.title)
    await expect(page.getByTestId(`accept-${asked.id}`)).toBeVisible()
    await expect(page.getByTestId(`decline-${asked.id}`)).toBeVisible()
  })

  /**
   * The instant, rendered — asserted by its properties rather than its exact
   * characters.
   *
   * The first version compared against `formatTimeOn("en", …)` called here, and
   * failed: this process is Node and the page is WebKit, and their ICU builds
   * write the same instant as "Oct 3 at 02:30 PM" and "Oct 3, 02:30 PM". That
   * is a difference between two correct renderings, so pinning either one makes
   * the test a report on which JavaScript engine ran it.
   */
  const TIMED = "2026-10-03T07:30:00.000Z"

  test("says when a meeting is, as a time and not as an ISO string", async ({ page }) => {
    await seed(page, [{ ...yours, startsAt: TIMED }])
    await visit(page, "meetings")

    const row = page.getByTestId(`meeting-${yours.id}`)
    await expect(row).toContainText(/\d{1,2}:\d{2}/)
    await expect(row, "the row must not show the wire format").not.toContainText(TIMED)
  })

  test("renders that same instant differently for a Thai reader", async ({ page }) => {
    await seed(page, [{ ...yours, startsAt: TIMED }])
    await visit(page, "meetings")
    const english = await page.getByTestId(`meeting-${yours.id}`).innerText()

    await page.addInitScript(() => localStorage.setItem("remy.locale", "th"))
    await seed(page, [{ ...yours, startsAt: TIMED }])
    await visit(page, "meetings")
    const thai = await page.getByTestId(`meeting-${yours.id}`).innerText()

    // The claim is that the time goes through the reader's locale like every
    // other date on the site, and this is the shortest thing that can only be
    // true if it does.
    expect(thai).not.toBe(english)
  })

  test("says nothing about time when there is none, because that means now", async ({ page }) => {
    await seed(page, [yours])
    await visit(page, "meetings")

    const row = page.getByTestId(`meeting-${yours.id}`)
    await expect(row).toContainText(m.meeting_from({ name: niran.name }, { locale: "en" }))
    // Not "—", not "no time set". The absence already says it.
    await expect(row).not.toContainText("·  ·")
  })
})

test.describe("Starting one", () => {
  const openDialog = async (page: Parameters<typeof seed>[0]) => {
    await seed(page)
    await visit(page, "meetings")
    await page.getByTestId("meeting-new").click()
    return page.getByTestId("meeting-form")
  }

  test("invites people, and says nothing about test rooms", async ({ page }) => {
    const form = await openDialog(page)

    await expect(page.getByTestId("meeting-send")).toHaveText(m.meeting_send({}, { locale: "en" }))
    // The defect, named: the experiment's copy on the product's own dialog.
    await expect(form).not.toContainText(m.meeting_test_create({}, { locale: "en" }))
    await expect(form).not.toContainText(m.meeting_test_experiment({}, { locale: "en" }))
  })

  test("offers every account, and narrows to what you typed", async ({ page }) => {
    const form = await openDialog(page)
    const list = page.getByTestId("meeting-people")

    await expect(list.getByTestId(/^pick-/)).toHaveCount(people.length)

    await form.getByTestId("meeting-people-search").fill("Niran")
    await expect(list.getByTestId(/^pick-/)).toHaveCount(1)
    await expect(list).toContainText(niran.name)
  })

  test("says so when nobody matches, rather than showing an empty box", async ({ page }) => {
    const form = await openDialog(page)

    await form.getByTestId("meeting-people-search").fill("zzzz")
    await expect(page.getByTestId("meeting-people-none")).toBeVisible()
    // The picker's own sentence, not the meeting's: the control is shared now,
    // and the reason nobody matched is the same wherever it is used.
    await expect(page.getByTestId("meeting-people-none")).toHaveText(m.people_no_match({}, { locale: "en" }))
  })

  test("keeps who you chose while you carry on searching", async ({ page }) => {
    const form = await openDialog(page)
    const search = form.getByTestId("meeting-people-search")

    await search.fill("Niran")
    await page.getByTestId(`pick-${niran.id}`).click()
    await expect(page.getByTestId(`chosen-${niran.id}`)).toHaveText(niran.name)

    // A chip is the answer to "who is coming?", so it has to survive the next
    // query — the checkbox list it replaced lost nothing only because it never
    // filtered.
    await search.fill("Somchai")
    await expect(page.getByTestId(`chosen-${niran.id}`)).toBeVisible()
  })

  test("asks when, and treats an empty answer as now", async ({ page }) => {
    const form = await openDialog(page)

    // Nullable, and null means now. A required time would be the field nobody
    // wants to fill in for "let us talk", which is why this feature exists.
    await expect(form.getByTestId("meeting-when")).toBeVisible()
    await expect(form).toContainText(m.meeting_when_hint({}, { locale: "en" }))
    await form.getByTestId("meeting-title").fill("Squad selection")
    await page.getByTestId(`pick-${niran.id}`).click()
    await expect(page.getByTestId("meeting-send"), "no time is a valid meeting").toBeEnabled()
  })

  test("sends the chosen time as an instant, not as somebody's wall clock", async ({ page }) => {
    const form = await openDialog(page)
    await form.getByTestId("meeting-title").fill("Squad selection")
    await page.getByTestId(`pick-${niran.id}`).click()
    await form.getByTestId("meeting-when").fill("2026-10-03T14:30")

    // Read back in the reader's language, because the native control renders in
    // the browser's — the whole point of DateField.
    await expect(page.getByTestId("meeting-when-read-back")).toContainText("2026")

    const posted = page.waitForRequest((r) => r.url().includes("/rpc/") && r.method() === "POST")
    await page.getByTestId("meeting-send").click()
    const body = (await posted).postData() ?? ""
    // A UTC instant. Sending "2026-10-03T14:30" raw would be half past two in
    // whichever timezone the server happened to read it in.
    expect(body, body).toMatch(/"startsAt":"2026-10-03T\d{2}:\d{2}:\d{2}(\.\d+)?Z"/)
  })

  test("sends the people you chose, and cannot be sent empty", async ({ page }) => {
    const form = await openDialog(page)
    const send = page.getByTestId("meeting-send")

    await expect(send, "a meeting with nobody in it is not a meeting").toBeDisabled()
    await form.getByTestId("meeting-title").fill("Squad selection")
    await expect(send, "a title alone invites nobody").toBeDisabled()

    await page.getByTestId(`pick-${niran.id}`).click()
    await expect(send).toBeEnabled()

    // What actually leaves the browser. The picker holds rows now rather than
    // ids, so the mapping back to ids is a step that can be got wrong silently.
    const posted = page.waitForRequest((r) => r.url().includes("/rpc/") && r.method() === "POST")
    await send.click()
    expect((await posted).postData() ?? "").toContain(niran.id)
  })

  test("is Thai for a Thai reader, the dialog included", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("remy.locale", "th"))
    const form = await openDialog(page)

    await expect(page.getByTestId("meeting-send")).toHaveText(m.meeting_send({}, { locale: "th" }))
    await expect(form).toContainText(m.meeting_people_label({}, { locale: "th" }))
  })
})

test.describe("The room", () => {
  test("says a meeting is not yours, rather than that you have none", async ({ page }) => {
    // The page had the empty-list sentence here — "No meetings yet" on a
    // meeting the reader had just opened a link to.
    await seed(page, [])
    await visit(page, "meeting", { id: "mtg_404" })

    await expect(page.getByTestId("meeting-not-found")).toHaveText(m.meeting_not_found({}, { locale: "en" }))
  })

  test("is named, and offers the join it does not perform on arrival", async ({ page }) => {
    await seed(page)
    await visit(page, "meeting", { id: yours.id })

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(yours.title)
    await expect(page.getByTestId("meeting-join")).toHaveText(m.meeting_join({}, { locale: "en" }))
    // Nothing opens a camera until somebody asks for it.
    await expect(page.getByTestId("meeting-media")).toHaveCount(0)
  })
})
