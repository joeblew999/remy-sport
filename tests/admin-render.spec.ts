import { test, expect } from "@playwright/test"
import { seedCache, entry, orpc } from "./helpers/seed-cache"
import { sessionKey } from "../src/web/lib/session"

/**
 * The six-role permission grid, rendered — with the session seeded.
 *
 * These are the UI half of the access-control matrix: does an organizer see the
 * create form, does a spectator see the denial, does the permission grid mark
 * the right actions. They assert what the page does with a role, not what the
 * API decides — the API half is tests/worker/authz.test.ts, where it belongs.
 *
 * Every one of them used to complete a real OTP sign-in first: request a code,
 * read it back, redeem it, then load the page. Six sign-ins to check six
 * `<span>` classes. `useSession` is a query now (lib/session.tsx), so its key is
 * seedable like any other and the role is simply an argument.
 *
 * `badge-success` is the contract here, not decoration — it is what says an
 * action is granted.
 */

const WRITERS = ["admin", "organizer"]
const READERS = ["coach", "player", "spectator", "referee"]

const as = (role: string) => ({
  queryKey: sessionKey as unknown as readonly unknown[],
  data: {
    user: { id: `u_${role}`, email: `${role}@remy.test`, name: role, role },
    session: { activeOrganizationId: null, impersonatedBy: null },
  },
})

const seed = (page: Parameters<typeof seedCache>[0], role: string) =>
  seedCache(page, [as(role), entry(orpc.events.list, undefined, { events: [] } as never)])

test.describe("The permission grid reflects the viewer's role", () => {
  for (const role of WRITERS) {
    test(`${role} sees the create form and write permissions`, async ({ page }) => {
      await seed(page, role)
      await page.goto("/#/admin")
      await expect(page.getByTestId("role-badge")).toHaveText(role)
      await expect(page.getByTestId("create-event-form")).toBeVisible()
      await expect(page.getByTestId("perm-create")).toHaveClass(/badge-success/)
      await expect(page.getByTestId("perm-read")).toHaveClass(/badge-success/)
      await expect(page.getByTestId("perm-delete")).toHaveClass(/badge-success/)
    })
  }

  for (const role of READERS) {
    test(`${role} sees the denial and read-only permissions`, async ({ page }) => {
      await seed(page, role)
      await page.goto("/#/admin")
      await expect(page.getByTestId("role-badge")).toHaveText(role)
      await expect(page.getByTestId("create-event-denied")).toBeVisible()
      await expect(page.getByTestId("perm-create")).not.toHaveClass(/badge-success/)
      await expect(page.getByTestId("perm-read")).toHaveClass(/badge-success/)
    })
  }

  test("a non-admin sees no account console at all", async ({ page }) => {
    await seed(page, "coach")
    await page.goto("/#/admin")
    await expect(page.getByTestId("role-badge")).toHaveText("coach")
    await expect(page.getByTestId("admin-console")).toHaveCount(0)
  })
})
