import { test, expect } from "./fixture"
import { visit } from "../helpers/surfaces"

/**
 * The code step, the way a phone uses it — docs/2026-09-09-01-sign-in-code-autofill.md.
 *
 * Mail hands a one-time code to the keyboard and one tap fills all six slots.
 * For that to sign the reader in with no second press, two things have to be
 * true of the page, and both are asserted here against mocked auth endpoints:
 * the code field is focused the moment the step opens, so the offered code
 * has somewhere to land; and the sixth digit redeems the code by itself. The
 * real redemption, against the Worker, is tests/e2e/spa-login.spec.ts.
 */
test("the code field is focused as the step opens, and six digits sign in without a press", async ({ page }) => {
  await page.route("**/api/auth/email-otp/send-verification-otp", (route) => route.fulfill({ json: { success: true } }))
  const redeemed = page.waitForRequest("**/api/auth/sign-in/email-otp")
  await page.route("**/api/auth/sign-in/email-otp", (route) => route.fulfill({ json: { user: { email: "somebody@example.test" } } }))

  await visit(page, "login")
  await page.getByTestId("spa-email-input").fill("somebody@example.test")
  await page.getByTestId("spa-send-code").click()

  const code = page.getByTestId("spa-otp-input")
  await expect(code).toBeVisible()
  await expect(code).toBeFocused()
  // The button is still there: for a reader who pastes five and types one.
  await expect(page.getByTestId("spa-verify-code")).toBeVisible()

  await code.fill("424242")
  const request = await redeemed
  expect(request.postDataJSON()).toMatchObject({ email: "somebody@example.test", otp: "424242" })
  // And it left the sign-in page: the redemption was acted on, not just sent.
  await expect(page.getByTestId("spa-login")).toHaveCount(0)
})
