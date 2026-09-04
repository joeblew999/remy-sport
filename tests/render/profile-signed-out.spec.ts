import { test, expect } from "./fixture"
import { asVisitor, sessionFor } from "../helpers/actors"
import { visit } from "../helpers/surfaces"
import { seedCache } from "../helpers/seed-cache"

test.describe("The profile page, signed out", () => {
  test("does not welcome a stranger back", async ({ page }) => {
    await asVisitor(page)
    await visit(page, "profile")

    // The bug, named: a greeting with nothing after the comma.
    await expect(page.getByRole("heading", { level: 1 })).not.toContainText("Welcome back")
    await expect(page.getByTestId("profile-signin")).toBeVisible()
  })

  test("offers the way in rather than a stack of empty cards", async ({ page }) => {
    await asVisitor(page)
    await visit(page, "profile")

    await expect(page.getByTestId("profile-signin-button")).toBeVisible()
    // The personal sections belong to somebody. There is nobody.
    await expect(page.getByTestId("profile")).toHaveCount(0)
  })

  test("and still shows the account to somebody signed in", async ({ page }) => {
    await seedCache(page, [sessionFor("COACH")])
    await visit(page, "profile")

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Welcome back")
    await expect(page.getByTestId("profile")).toBeVisible()
    await expect(page.getByTestId("profile-signin")).toHaveCount(0)
  })
})
