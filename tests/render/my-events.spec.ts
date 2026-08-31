import { test, expect } from "./fixture"
import { seedCache, entry, orpc } from "../helpers/seed-cache"
import { apiEvent, apiReference } from "../helpers/api-fixtures"
import { VOCABULARY } from "../../src/domain/vocabularies"
import { sessionKey } from "../../src/web/lib/session"

/**
 * My Events, rendered — the screen that replaced a nav item pointing at
 * Discover.
 *
 * What is worth asserting is the one decision the page makes: it puts a row
 * under Organising or Following according to the `relation` the server returned,
 * and nothing else. It does not compare an organiser id to the session, because
 * that is the OWNER relation reimplemented in a browser — the mistake the admin
 * console carried until it was removed.
 */

const signedIn = {
  queryKey: sessionKey as unknown as readonly unknown[],
  data: {
    user: { id: "usr_org_001", email: "organiser@remy.test", name: "Niran", role: "organizer" },
    session: { activeOrganizationId: null, impersonatedBy: null },
  },
}

/** `events.mine` as the contract declares it, relation and all. */
const mine = (
  events: { id: string; name: string; relation: "OWNER" | "CO_ORGANIZER" | "FOLLOWER_EVENT" }[],
) =>
  entry(orpc.events.mine, undefined, {
    events: events.map((e) => ({
      ...apiEvent({ id: e.id, name: e.name, names: { en: e.name } }),
      relation: e.relation,
    })),
  })

const seed = (page: Parameters<typeof seedCache>[0], rows: Parameters<typeof mine>[0]) =>
  seedCache(page, [signedIn, mine(rows), entry(orpc.reference.list, undefined, apiReference(VOCABULARY))])

test.describe("My Events", () => {
  test("splits what you organise from what you follow", async ({ page }) => {
    await seed(page, [
      { id: "evt_a", name: "Bangkok Schools League", relation: "OWNER" },
      { id: "evt_b", name: "Chiang Mai Invitational", relation: "CO_ORGANIZER" },
      { id: "evt_c", name: "Phuket Beach Classic", relation: "FOLLOWER_EVENT" },
    ])
    await page.goto("/#/events")

    const organising = page.getByTestId("my-events-organising")
    const following = page.getByTestId("my-events-following")

    // A co-organiser runs the event, so they belong beside the owner. The
    // model's difference between the two is about deleting it, which is a
    // control on the event page rather than a heading here.
    await expect(organising.getByTestId("my-event-evt_a")).toBeVisible()
    await expect(organising.getByTestId("my-event-evt_b")).toBeVisible()
    await expect(organising.getByTestId("my-event-evt_c")).toHaveCount(0)

    await expect(following.getByTestId("my-event-evt_c")).toBeVisible()
    await expect(following.getByTestId("my-event-evt_a")).toHaveCount(0)
  })

  test("says so for each half separately, rather than showing an empty page", async ({ page }) => {
    // Organising something and following nothing is an ordinary state, and the
    // two sections have to say different things about it.
    await seed(page, [{ id: "evt_a", name: "Bangkok Schools League", relation: "OWNER" }])
    await page.goto("/#/events")

    await expect(page.getByTestId("my-event-evt_a")).toBeVisible()
    await expect(page.getByTestId("organising-none")).toHaveCount(0)
    await expect(page.getByTestId("following-none")).toBeVisible()
  })

  test("asks a signed-out reader to sign in rather than erroring", async ({ page }) => {
    // The list is defined by relations to you; a stranger holds none, so there
    // is nothing to show and nothing has gone wrong.
    await seedCache(page, [{ queryKey: sessionKey as unknown as readonly unknown[], data: null }])
    await page.goto("/#/events")
    await expect(page.getByTestId("my-events-signin")).toBeVisible()
  })

  test("is reachable from the sidebar, which is why it exists", async ({ page }) => {
    // The entry was deleted because it led to Discover. A test that the nav
    // reaches this screen is the one that would have caught that.
    await seed(page, [{ id: "evt_a", name: "Bangkok Schools League", relation: "OWNER" }])
    await page.goto("/#/discover")
    await page.locator(".sidebar").getByRole("button", { name: "My events" }).click()
    await expect(page.getByTestId("my-events-organising")).toBeVisible()
    await expect(page.getByTestId("my-event-evt_a")).toBeVisible()
  })
})
