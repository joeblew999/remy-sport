import { test, expect } from "./fixture"
import { VISITOR , sessionFor, type Role } from "../helpers/actors"
import { visit } from "../helpers/surfaces"
import { seedCache, entry, orpc } from "../helpers/seed-cache"
import { apiEvent, type ApiPlayerRow } from "../helpers/api-fixtures"

/**
 * The admin console, rendered — with the session and the API's answers seeded.
 *
 * These used to be "the six-role permission grid": a table of role → actions
 * lived in admin.tsx, and these tests asserted it by seeding a role and reading
 * the badges back. They were a faithful test of a copy. The copy agreed with
 * the model, so they passed; had it drifted they would have kept passing, since
 * the model was not in the loop.
 *
 * The page reads `canCreate` off `events.list` and `canEdit`/`canDelete` off
 * each event now, all three resolved by `can()` on the server. So the input
 * here is what the API says, and the role is only what it should always have
 * been: the thing that decides whether the *account console* appears.
 *
 * `badge-success` is the contract, not decoration — it is what says an action
 * is granted.
 *
 * Every fixture goes through `apiEvent()`, and none of them casts. The previous
 * versions ended `{ events: [] }`, which suppressed exactly the error
 * that would have caught `canCreate` being added to the response.
 */

/**
 * The seeded person for a role, not an invented one.
 *
 * This built `u_coach` / `coach@remy.test` from whatever string it was handed,
 * so a spec asserting what a coach may do was asserting it about somebody the
 * model has never heard of. `sessionFor` reads SEED_ENTITIES.users.
 */
const as = (role: Role) => sessionFor(role)

/**
 * Whether the model grants this reader the platform actions, from the server.
 *
 * The console asked `role === "admin"` in the browser until 2026-09-03 — a
 * second copy of a rule `GRANTS` owns. It reads `me.mine`'s `can` now, so these
 * specs seed the answer rather than relying on the role string in the session.
 * Three of them failed the moment the source changed, which is the seam working.
 */
const grants = (can: Record<string, boolean>) =>
  entry(orpc.me.mine, undefined, { holdings: [], can })

/** The platform admin, as the model answers for them. */
const asPlatformAdmin = grants({
  MANAGE_ALL_USERS: true,
  MODERATE_LISTINGS: true,
  APPROVE_REFEREE: true,
  DELETE_PLAYER: true,
})

/** Anybody else. */
const asNotAdmin = grants({})

/** What `events.list` returns, with the permissions the server decided. */
const events = (over: { canCreate: boolean; canEdit?: boolean; canDelete?: boolean }) =>
  entry(orpc.events.list, undefined, {
    events: [
      apiEvent({
        id: "e1",
        name: "Visible in the table",
        names: { en: "Visible in the table" },
        canEdit: over.canEdit ?? false,
        canDelete: over.canDelete ?? false,
      }),
    ],
    canCreate: over.canCreate,
  })

test.describe("The permission grid reflects what the server granted", () => {
  test("a viewer the server says may write sees the form and the badges", async ({ page }) => {
    await seedCache(page, [
      as("ORGANIZER"),
      asNotAdmin,
      events({ canCreate: true, canEdit: true, canDelete: true }),
    ])
    await visit(page, "admin")
    await expect(page.getByTestId("create-event-form")).toBeVisible()
    await expect(page.getByTestId("perm-create")).toHaveClass(/badge-success/)
    await expect(page.getByTestId("perm-read")).toHaveClass(/badge-success/)
    await expect(page.getByTestId("perm-update")).toHaveClass(/badge-success/)
    await expect(page.getByTestId("perm-delete")).toHaveClass(/badge-success/)
  })

  test("a viewer the server says may only read sees the denial", async ({ page }) => {
    await seedCache(page, [as("COACH"), asNotAdmin, events({ canCreate: false })])
    await visit(page, "admin")
    await expect(page.getByTestId("create-event-denied")).toBeVisible()
    await expect(page.getByTestId("perm-create")).not.toHaveClass(/badge-success/)
    await expect(page.getByTestId("perm-delete")).not.toHaveClass(/badge-success/)
    await expect(page.getByTestId("perm-read")).toHaveClass(/badge-success/)
  })

  /**
   * The distinction the old role table could not draw.
   *
   * A co-organiser holds EDIT_EVENT and not DELETE_EVENT. Under a role→actions
   * map, "organizer" meant create+read+update+delete and there was no way to
   * express somebody who may change an event but not destroy it — the model has
   * always said so, and the console could not show it.
   */
  test("editing without deleting is expressible, and shows no Delete button", async ({ page }) => {
    await seedCache(page, [
      as("ORGANIZER"),
      asNotAdmin,
      events({ canCreate: true, canEdit: true, canDelete: false }),
    ])
    await visit(page, "admin")
    await expect(page.getByTestId("perm-update")).toHaveClass(/badge-success/)
    await expect(page.getByTestId("perm-delete")).not.toHaveClass(/badge-success/)
    await expect(page.getByTestId("events-table").locator("button.danger")).toHaveCount(0)
  })

  test("a viewer the server says may delete gets the button", async ({ page }) => {
    await seedCache(page, [
      as("ADMIN"),
      asPlatformAdmin,
      events({ canCreate: true, canEdit: true, canDelete: true }),
    ])
    await visit(page, "admin")
    await expect(page.getByTestId("events-table").locator("button.danger")).toHaveCount(1)
  })

  test("a non-admin sees no account console at all", async ({ page }) => {
    await seedCache(page, [as("COACH"), asNotAdmin, events({ canCreate: false })])
    await visit(page, "admin")
    await expect(page.getByTestId("role-badge")).toHaveText("coach")
    await expect(page.getByTestId("admin-console")).toHaveCount(0)
  })

  test("the role switcher offers all six actors", async ({ page }) => {
    await seedCache(page, [
      as("ADMIN"),
      asPlatformAdmin,
      events({ canCreate: true }),
      {
        // `useDevAccounts` — the seeded-accounts list the switcher renders. It
        // 404s to an empty result where neither the outbox nor a fixed code is
        // available, so seeding it is what makes this test independent of
        // MAIL_TRANSPORT. `{ accounts, code? }` since a deployment with a fixed
        // code sends the code down with the list.
        queryKey: ["dev", "accounts"] as readonly unknown[],
        data: {
          accounts: ["admin", "organizer", "coach", "player", "spectator", "referee"].map((role) => ({
            role,
            email: `${role}@remy.test`,
            name: role,
            holds: [],
          })),
        },
      },
    ])
    await visit(page, "admin")
    const switcher = page.getByTestId("role-switcher")
    await expect(switcher).toBeVisible()
    await expect(switcher.locator("button")).toHaveCount(6)
  })

  test("the events table renders the events it was given", async ({ page }) => {
    await seedCache(page, [as("ORGANIZER"), events({ canCreate: true })])
    await visit(page, "admin")
    const table = page.getByTestId("events-table")
    await expect(table).toBeVisible()
    await expect(table.locator("tbody tr")).not.toHaveCount(0)
  })

  /**
   * `PENDING_APPROVAL` could be entered and never left: `APPROVE_REFEREE` was
   * granted to PLATFORM_ADMIN and had no endpoint. The console could not even
   * show it — the Status column knew only "banned" and "active".
   */
  test("shows an admin who is waiting, and offers to approve them", async ({ page }) => {
    await seedCache(page, [as("ADMIN"), asPlatformAdmin, events({ canCreate: true })])
    await page.route("**/api/auth/admin/list-users**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          users: [
            { id: "u_ref", email: "ref@remy.test", name: "Waraporn", role: "referee", statusCode: "PENDING_APPROVAL" },
            { id: "u_other", email: "coach@remy.test", name: "Wichai", role: "coach", statusCode: "ACTIVE" },
          ],
        }),
      }),
    )
    await visit(page, "admin")

    await expect(page.getByTestId("pending-ref@remy.test")).toBeVisible()
    await expect(page.getByTestId("approve-ref@remy.test")).toBeVisible()
  })

  test("offers approval only where it means something", async ({ page }) => {
    // APPROVE_REFEREE is "approve a referee", not "set a status". An active
    // coach is neither waiting nor a referee, so there is nothing to approve —
    // and a control that appears there would be offering a 400.
    await seedCache(page, [as("ADMIN"), asPlatformAdmin, events({ canCreate: true })])
    await page.route("**/api/auth/admin/list-users**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          users: [
            { id: "u_other", email: "coach@remy.test", name: "Wichai", role: "coach", statusCode: "ACTIVE" },
            { id: "u_ref2", email: "active@remy.test", name: "Somsak", role: "referee", statusCode: "ACTIVE" },
          ],
        }),
      }),
    )
    await visit(page, "admin")

    await expect(page.getByTestId("accounts-table")).toBeVisible()
    await expect(page.getByTestId("approve-coach@remy.test")).toHaveCount(0)
    await expect(page.getByTestId("approve-active@remy.test")).toHaveCount(0)
  })

  /**
   * The model defines four statuses and this column rendered three outcomes.
   *
   * It tested for PENDING_APPROVAL and called everything else "Active", so a
   * SUSPENDED or DEACTIVATED account read as active — in the one screen whose
   * job is to say otherwise. It goes through the `userStatuses` vocabulary now,
   * which is also what makes it translated.
   */
  test("a suspended account does not read as active", async ({ page }) => {
    await seedCache(page, [as("ADMIN"), asPlatformAdmin, events({ canCreate: true })])
    await page.route("**/api/auth/admin/list-users**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          users: [
            { id: "u_s", email: "suspended@remy.test", name: "Nok", role: "coach", statusCode: "SUSPENDED" },
            { id: "u_d", email: "gone@remy.test", name: "Anan", role: "coach", statusCode: "DEACTIVATED" },
            { id: "u_a", email: "fine@remy.test", name: "Mali", role: "coach", statusCode: "ACTIVE" },
          ],
        }),
      }),
    )
    await visit(page, "admin")

    const table = page.getByTestId("accounts-table")
    await expect(table).toBeVisible()
    const rowFor = (email: string) => table.locator("tr").filter({ hasText: email })
    await expect(rowFor("suspended@remy.test")).toContainText("Suspended")
    await expect(rowFor("gone@remy.test")).toContainText("Deactivated")
    await expect(rowFor("fine@remy.test")).toContainText("Active")
    // And the one that is genuinely active is the only one not marked off.
    await expect(rowFor("suspended@remy.test").locator(".badge-off")).toHaveCount(1)
  })

  test("a signed-out visitor is sent to the login screen", async ({ page }) => {
    // Seeded as nobody: `useSession` resolves to a null user without a request,
    // so the redirect happens on first paint rather than after a round trip.
    await seedCache(page, [VISITOR])
    await visit(page, "admin")
    await page.waitForURL("**/#/login")
  })
})

/**
 * Deleting a player, which is not the roster's "Remove".
 *
 * `DELETE_PLAYER` is granted to PLATFORM_ADMIN alone and had no screen at all,
 * so a player created by mistake stayed forever — the same gap `DELETE_TEAM`
 * had until this console got one. It is deliberately not on the team page: that
 * roster is a coach's tool, "Remove" there ends a spell on a squad, and the two
 * controls side by side would invite the mistake.
 *
 * Gated on the model's own answer rather than on `isAdmin`. They agree today
 * because the PO grants both to PLATFORM_ADMIN, and a screen that assumes so is
 * exactly the second copy this pass exists to remove — so the "hidden" case
 * seeds an admin who holds MANAGE_ALL_USERS and not this.
 */
const players = (items: ApiPlayerRow[]) => entry(orpc.players.list, undefined, { items })

/** A whole row, because `players.list` returns the table and the schema is derived from it. */
const NIRAN: ApiPlayerRow = {
  id: "plr_1",
  userId: null,
  names: { en: "Niran" },
  jerseyNumber: 7,
  positionCode: "PG",
  dob: "2011-04-02",
}

test.describe("Deleting a player", () => {
  test("a platform admin can, and the confirmation names what goes with them", async ({ page }) => {
    await seedCache(page, [
      as("ADMIN"),
      asPlatformAdmin,
      events({ canCreate: true }),
      players([NIRAN]),
    ])
    await visit(page, "admin")

    await expect(page.getByTestId("admin-players")).toBeVisible()
    await expect(page.getByTestId("admin-player-plr_1")).toContainText("Niran")
    await expect(page.getByTestId("delete-player-plr_1")).toBeVisible()
  })

  test("an admin without the grant does not see it", async ({ page }) => {
    await seedCache(page, [
      as("ADMIN"),
      // Holds the console, does not hold this. If the section were gated on
      // `isAdmin` it would appear anyway, which is what this asserts against.
      grants({ MANAGE_ALL_USERS: true }),
      events({ canCreate: true }),
      players([NIRAN]),
    ])
    await visit(page, "admin")

    await expect(page.getByTestId("admin-console")).toBeVisible()
    await expect(page.getByTestId("admin-players")).toHaveCount(0)
  })

  test("says so when there are none, rather than rendering an empty card", async ({ page }) => {
    await seedCache(page, [as("ADMIN"), asPlatformAdmin, events({ canCreate: true }), players([])])
    await visit(page, "admin")

    await expect(page.getByTestId("admin-no-players")).toBeVisible()
  })
})
