import { test, expect } from "@playwright/test"
import { signInThroughLoginForm, ADMIN, IS_LOCAL } from "./helpers/auth"

// The login screen is passwordless now (ADR 012): one email field, then one
// code field. Sign-up mode is gone — an address that can receive a code gets an
// account, so offering "sign in or sign up?" asked a question with no answer.

test.describe("Login page", () => {
  test("renders the email step, with no password field anywhere", async ({ page }) => {
    await page.goto("/login")
    await expect(page.locator("h1")).toHaveText("Sign In")
    await expect(page.getByTestId("email-input")).toBeVisible()
    await expect(page.getByTestId("send-code")).toBeVisible()
    // The regression that matters: a password box reappearing would mean a
    // second way in came back.
    await expect(page.locator('input[type="password"]')).toHaveCount(0)
  })

  test("the code field appears only after a code is requested", async ({ page }) => {
    await page.goto("/login")
    await expect(page.getByTestId("otp-input")).toBeHidden()
    await page.getByTestId("email-input").fill(ADMIN)
    await page.getByTestId("send-code").click()
    await expect(page.getByTestId("otp-input")).toBeVisible()
    await expect(page.locator("#sentTo")).toHaveText(ADMIN)
  })

  test("you can go back and use a different email", async ({ page }) => {
    await page.goto("/login")
    await page.getByTestId("email-input").fill(ADMIN)
    await page.getByTestId("send-code").click()
    await expect(page.getByTestId("otp-input")).toBeVisible()
    await page.getByTestId("use-different-email").click()
    await expect(page.getByTestId("otp-input")).toBeHidden()
    await expect(page.getByTestId("email-input")).toBeVisible()
  })

  test("a wrong code is refused and keeps you on the code step", async ({ page }) => {
    await page.goto("/login")
    await page.getByTestId("email-input").fill(ADMIN)
    await page.getByTestId("send-code").click()
    await page.getByTestId("otp-input").fill("000000")
    await page.getByTestId("verify-code").click()
    await expect(page.locator("#error")).toBeVisible()
    await expect(page.getByTestId("otp-input")).toBeVisible()
  })

  test("a correct code signs you in", async ({ page }) => {
    test.skip(!IS_LOCAL, "reading the emailed code needs the local dev outbox")
    await signInThroughLoginForm(page, ADMIN)
    const email = await page.evaluate(async () => {
      const r = await fetch("/api/auth/get-session")
      return (await r.json())?.user?.email ?? null
    })
    expect(email).toBe(ADMIN)
  })

  test("has back to home link", async ({ page }) => {
    await page.goto("/login")
    await expect(page.locator('a[href="/"]')).toBeVisible()
  })

  test("shows quick-fill buttons for all 6 actors", async ({ page }) => {
    await page.goto("/login")
    for (const role of ["Admin", "Organizer", "Coach", "Player", "Spectator", "Referee"]) {
      await expect(page.locator(`button:text('${role}')`)).toBeVisible()
    }
  })
})
