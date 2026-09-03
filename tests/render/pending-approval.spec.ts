import { test, expect } from "./fixture"
import { sessionFor } from "../helpers/actors"
import { visit } from "../helpers/surfaces"
import { seedCache } from "../helpers/seed-cache"

/**
 * A referee awaiting approval is told so.
 *
 * `src/auth.config.ts` lets a PENDING_APPROVAL account sign in on purpose, and
 * states the reason: such a referee "has an account and needs to see that they
 * are waiting". Nothing in the GUI ever said it — they signed in to an
 * ordinary-looking app with no sign their sign-up was incomplete.
 *
 * The other two non-active states never reach a page at all: SUSPENDED and
 * DEACTIVATED are refused when the session is created, which is why this is
 * about one status and not a general banner.
 */

const withStatus = (statusCode: string | null) => sessionFor("REFEREE", { statusCode })

test.describe("Waiting for approval", () => {
  test("tells a pending referee, wherever they are", async ({ page }) => {
    // Above the page rather than on one screen: it is a fact about the account,
    // true on every route, which is why it sits where the impersonation banner
    // does.
    await seedCache(page, [withStatus("PENDING_APPROVAL")])
    await visit(page, "dashboard")
    await expect(page.getByTestId("pending-approval-banner")).toBeVisible()

    await visit(page, "discover")
    await expect(page.getByTestId("pending-approval-banner")).toBeVisible()
  })

  test("says nothing to an active account", async ({ page }) => {
    await seedCache(page, [withStatus("ACTIVE")])
    await visit(page, "dashboard")
    await expect(page.getByTestId("pending-approval-banner")).toHaveCount(0)
  })

  test("says nothing when the status is absent", async ({ page }) => {
    // Null is what an account created before migration 0008 carries, and what
    // Better Auth writes for a row it made itself. It is not "pending".
    await seedCache(page, [withStatus(null)])
    await visit(page, "dashboard")
    await expect(page.getByTestId("pending-approval-banner")).toHaveCount(0)
  })
})
