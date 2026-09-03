import { test, expect } from "./fixture"
import { sessionFor } from "../helpers/actors"
import { visit } from "../helpers/surfaces"
import { seedCache, entry, orpc } from "../helpers/seed-cache"

/**
 * The screen an invitation had no way to reach.
 *
 * `addCoOrganizer` and `acceptCoOrganizerInvite` both worked, and nothing
 * connected them: a person could be given an event to help run and never find
 * out. The fixtures seed exactly that state, so it was reachable on a fresh
 * database and unreachable from the app.
 *
 * What the *consequence* of accepting is — ACCEPTED, then CO_ORGANIZER, then
 * EDIT_EVENT — belongs in tests/worker/write.test.ts, where an isolated D1 can
 * answer it. This tier owns the part that was actually missing: that there is
 * something on the page at all, and that pressing it asks the server.
 */

const signedIn = sessionFor("SPECTATOR")

const invitation = {
  eventId: "evt_002",
  names: { en: "Bangkok Schools Basketball League 2026", th: "ลีกบาสเกตบอลโรงเรียนกรุงเทพ" },
  name: "Bangkok Schools Basketball League 2026",
  addedAt: "2026-08-20",
}

test.describe("A pending co-organiser invitation", () => {
  test("appears on the profile, named, with something to press", async ({ page }) => {
    await seedCache(page, [
      signedIn,
      entry(orpc.events.invitations, undefined, { invitations: [invitation] }),
    ])
    await visit(page, "dashboard")

    const card = page.getByTestId("invite-evt_002")
    await expect(card).toBeVisible()
    await expect(card, "an invitation nobody can identify is not an invitation").toContainText(
      invitation.name,
    )
    await expect(page.getByTestId("accept-evt_002")).toBeVisible()
  })

  test("is named in the reader's language, like every other name", async ({ page }) => {
    // The event carries the model's `names`, resolved client-side, so this is
    // the same path every team and venue name takes. Sending a pre-resolved
    // string would have been simpler and would have made this one screen the
    // only place a name ignores the reader's locale.
    await page.addInitScript(() => localStorage.setItem("remy.locale", "th"))
    await seedCache(page, [
      signedIn,
      entry(orpc.events.invitations, undefined, { invitations: [invitation] }),
    ])
    await visit(page, "dashboard")

    await expect(page.getByTestId("invite-evt_002")).toContainText(invitation.names.th)
  })

  test("shows nothing at all when there is nothing outstanding", async ({ page }) => {
    // Not an empty card saying "no invitations". An invitation is an
    // interruption; the absence of one is not news, and a permanent empty panel
    // is what teaches people to stop reading a section.
    await seedCache(page, [
      signedIn,
      entry(orpc.events.invitations, undefined, { invitations: [] }),
    ])
    await visit(page, "dashboard")

    await expect(page.getByTestId("profile-events")).toBeVisible()
    await expect(page.getByTestId("invitations")).toHaveCount(0)
  })

  test("pressing accept asks the server about that event", async ({ page }) => {
    const asked: string[] = []

    // `seedCache` first, then this. It installs a catch-all `**/rpc/**` route
    // of its own, and Playwright gives the *last* registered handler priority —
    // so registering this one first meant it never ran and the click appeared
    // to do nothing.
    await seedCache(page, [
      signedIn,
      entry(orpc.events.invitations, undefined, { invitations: [invitation] }),
    ])
    await page.route("**/rpc/**", async (route) => {
      const url = route.request().url()
      if (!url.includes("acceptCoOrganizerInvite")) return route.fallback()
      asked.push(`${url} ${route.request().postData() ?? ""}`)
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          json: { eventId: "evt_002", userId: "usr_org_001", statusCode: "ACCEPTED" },
        }),
      })
    })

    await visit(page, "dashboard")
    await page.getByTestId("accept-evt_002").click()

    await expect.poll(() => asked.length, { message: "accept must reach the server" }).toBe(1)
    // The event id, not just "some accept happened" — a button wired to the
    // wrong row is the failure this catches.
    expect(asked[0]).toContain("evt_002")
  })
})
