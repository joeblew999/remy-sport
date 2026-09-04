import { test, expect } from "./fixture"
import { asVisitor, sessionFor } from "../helpers/actors"
import { visit } from "../helpers/surfaces"
import { seedCache } from "../helpers/seed-cache"

/**
 * The profile page with nobody signed in.
 *
 * Every entry in the sidebar is offered to a visitor, and this one had no
 * signed-out branch at all. `welcome_back` interpolates a name, so with no
 * session it rendered "Welcome back, " — an empty greeting, an empty email line
 * and a stack of cards each showing its own empty state.
 *
 * my-events.tsx and team.tsx both handle having no reader. The page whose entire
 * job is to show you yourself was the one that did not.
 */
test.describe("The profile page, signed out", () => {
  test("does not welcome a stranger back", async ({ page }) => {
    await asVisitor(page)
    await visit(page, "dashboard")

    // The bug, named: a greeting with nothing after the comma.
    await expect(page.getByRole("heading", { level: 1 })).not.toContainText("Welcome back")
    await expect(page.getByTestId("profile-signin")).toBeVisible()
  })

  test("offers the way in rather than a stack of empty cards", async ({ page }) => {
    await asVisitor(page)
    await visit(page, "dashboard")

    await expect(page.getByTestId("profile-signin-button")).toBeVisible()
    // The personal sections belong to somebody. There is nobody.
    await expect(page.getByTestId("profile-events")).toHaveCount(0)
  })

  test("and still shows the real page to somebody signed in", async ({ page }) => {
    await seedCache(page, [sessionFor("COACH")])
    await visit(page, "dashboard")

    await expect(page.getByTestId("profile-events")).toBeVisible()
    await expect(page.getByTestId("profile-signin")).toHaveCount(0)
  })
})
