import { test, expect } from "./fixture"
import { sessionFor } from "../helpers/actors"
import { visit } from "../helpers/surfaces"
import { seedCache, entry, orpc } from "../helpers/seed-cache"

/**
 * The way in to the admin console, which had none.
 *
 * `/#/admin` was reachable only by typing it. Nothing in the sidebar, the
 * topbar or any page linked to it — so the account list, the role controls,
 * approving a referee, deleting a team or a player and creating an account were
 * all built, enforced, and findable only by somebody who already knew the URL.
 *
 * The link asks the model the same question the console asks itself. A nav entry
 * deciding it from `user.role === "admin"` would be the second copy that keeps
 * being the bug in this app: a link to a page the API then refuses is a 403 with
 * extra steps.
 */
const holdings = (can: Record<string, boolean>) =>
  entry(orpc.me.mine, undefined, { holdings: [], can })

test.describe("Reaching the admin console", () => {
  // The way in is a menu item in the dropdown on the topbar avatar (B2 step
  // 8), and the item mounts only when the menu is open — so every assertion
  // below opens the menu first. Asserting on a closed menu would be a count
  // of nothing, which passes for the wrong reason.
  test("is offered to somebody the model says may manage users", async ({ page }) => {
    await seedCache(page, [sessionFor("ADMIN"), holdings({ MANAGE_ALL_USERS: true })])
    await visit(page, "discover")

    await page.getByTestId("account").click()
    await expect(page.getByTestId("account-admin")).toBeVisible()
  })

  test("is not offered to anybody else", async ({ page }) => {
    await seedCache(page, [sessionFor("COACH"), holdings({})])
    await visit(page, "discover")

    await page.getByTestId("account").click()
    await expect(page.getByTestId("account-admin")).toHaveCount(0)
  })

  test("and it goes to the console", async ({ page }) => {
    await seedCache(page, [sessionFor("ADMIN"), holdings({ MANAGE_ALL_USERS: true })])
    await visit(page, "discover")
    await page.getByTestId("account").click()
    await page.getByTestId("account-admin").click()

    await expect(page).toHaveURL(/#\/admin$/)
  })
})
