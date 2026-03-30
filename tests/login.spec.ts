import { test, expect } from "@playwright/test"

test.describe("Login page", () => {
  test("renders sign in form", async ({ page }) => {
    await page.goto("/login")
    await expect(page.locator("h1")).toHaveText("Sign In")
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
  })

  test("can toggle to sign up mode", async ({ page }) => {
    await page.goto("/login")
    await page.click("text=Sign Up")
    await expect(page.locator("h1")).toHaveText("Create Account")
    await expect(page.locator('input[name="name"]')).toBeVisible()
  })

  test("starts in sign up mode with query param", async ({ page }) => {
    await page.goto("/login?mode=signup")
    await expect(page.locator("h1")).toHaveText("Create Account")
  })

  test("has back to home link", async ({ page }) => {
    await page.goto("/login")
    const backLink = page.locator('a[href="/"]')
    await expect(backLink).toBeVisible()
  })

  test("shows quick-fill buttons for all 6 actors", async ({ page }) => {
    await page.goto("/login")
    for (const role of ["Admin", "Organizer", "Coach", "Player", "Spectator", "Referee"]) {
      await expect(page.locator(`button:text('${role}')`)).toBeVisible()
    }
  })
})
