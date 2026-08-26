import { test, expect } from "@playwright/test"
import { ACTOR_NAMES, ADMIN, COACH, IS_LOCAL } from "./helpers/auth"

// ADR 012 + ADR 008 step 4. The SPA had no authentication at all: it never
// learned who was viewing, which is why the accept-invitation page had to hand
// people off to the server-rendered harness to sign in. Both GUIs now run the
// same two-step passwordless flow against the same two endpoints.

const LOCAL_CODE = "424242" // fixed for @remy.dev — see tests/helpers/auth.ts

test.describe("SPA sign-in", () => {
  test.skip(!IS_LOCAL, "signing in needs the fixed dev code")

  test("the SPA has its own login screen, with no password field", async ({ page }) => {
    await page.goto("/#/login")
    await expect(page.getByTestId("spa-login")).toBeVisible()
    await expect(page.getByTestId("spa-email-input")).toBeVisible()
    await expect(page.locator('input[type="password"]')).toHaveCount(0)
  })

  test("requesting a code reveals the code step, same as the dashboard", async ({ page }) => {
    await page.goto("/#/login")
    await expect(page.getByTestId("spa-otp-input")).toHaveCount(0)
    await page.getByTestId("spa-email-input").fill(ADMIN)
    await page.getByTestId("spa-send-code").click()
    await expect(page.getByTestId("spa-otp-input")).toBeVisible()
  })

  test("a correct code signs in and the session is shared across the app", async ({ page }) => {
    await page.goto("/#/login")
    await page.getByTestId("spa-email-input").fill(COACH)
    await page.getByTestId("spa-send-code").click()
    await page.getByTestId("spa-otp-input").fill(LOCAL_CODE)
    await page.getByTestId("spa-verify-code").click()

    // Lands back in the app, not on a server-rendered page.
    await expect(page.getByTestId("spa-login")).toHaveCount(0)

    const session = await page.evaluate(async () => {
      const r = await fetch("/api/auth/get-session")
      const s = await r.json()
      return { email: s?.user?.email ?? null, org: s?.session?.activeOrganizationId ?? null }
    })
    expect(session.email).toBe(COACH)
    // The coach is seeded into Assumption College, so the session hook that
    // ADR 011 added should have picked an active organization.
    expect(session.org).toBeTruthy()
  })

  test("a wrong code keeps you on the code step", async ({ page }) => {
    await page.goto("/#/login")
    await page.getByTestId("spa-email-input").fill(ADMIN)
    await page.getByTestId("spa-send-code").click()
    await page.getByTestId("spa-otp-input").fill("000000")
    await page.getByTestId("spa-verify-code").click()
    await expect(page.getByTestId("login-error")).toBeVisible()
    await expect(page.getByTestId("spa-otp-input")).toBeVisible()
  })

  test("the topbar offers sign-in — the login route is reachable without typing a URL", async ({ page }) => {
    // The gap that made this feature untestable-but-shipped: a login route
    // existed and nothing linked to it, so it was reachable only by typing
    // #/login. Navigating by URL in tests hid that completely.
    await page.goto("/")
    await expect(page.getByTestId("topbar-sign-in")).toBeVisible()
    await page.getByTestId("topbar-sign-in").click()
    await expect(page.getByTestId("spa-login")).toBeVisible()
  })

  test("once signed in the topbar shows who you are, and can sign you out", async ({ page }) => {
    await page.goto("/#/login")
    await page.getByTestId("spa-email-input").fill(COACH)
    await page.getByTestId("spa-send-code").click()
    await page.getByTestId("spa-otp-input").fill(LOCAL_CODE)
    await page.getByTestId("spa-verify-code").click()

    await expect(page.getByTestId("topbar-account")).toBeVisible()
    await expect(page.getByTestId("topbar-user")).toContainText(ACTOR_NAMES.COACH)
    // The platform role, which is what decides permissions (ADR 009).
    await expect(page.getByTestId("topbar-role")).toHaveText("coach")

    await page.getByTestId("topbar-sign-out").click()
    await expect(page.getByTestId("topbar-sign-in")).toBeVisible()
    await expect(page.getByTestId("topbar-account")).toHaveCount(0)

    // Signing out must actually end the session, not just re-render.
    const stillSignedIn = await page.evaluate(async () => {
      const r = await fetch("/api/auth/get-session")
      return (await r.json())?.user?.email ?? null
    })
    expect(stillSignedIn).toBeNull()
  })

  test("the SPA login offers the same dev accounts the dashboard does", async ({ page }) => {
    // The inconsistency: quick-fill existed in the harness and not in the SPA,
    // so the two GUIs disagreed about how to get in during development.
    await page.goto("/#/login")
    await expect(page.getByTestId("spa-dev-accounts")).toBeVisible()
    for (const role of ["admin", "organizer", "coach", "player", "spectator", "referee"]) {
      await expect(page.getByTestId(`spa-dev-${role}`)).toBeVisible()
    }
  })

  test("a dev account button signs you in end to end", async ({ page }) => {
    await page.goto("/#/login")
    await page.getByTestId("spa-dev-referee").click()
    await expect(page.getByTestId("spa-otp-input")).toBeVisible()
    await page.getByTestId("spa-verify-code").click()
    await expect(page.getByTestId("topbar-role")).toHaveText("referee")
  })

  test("an invitee is offered sign-in inside the SPA, not sent to the harness", async ({ page }) => {
    // The hand-off ADR 011 called jarring: this used to be an <a href="/login">
    // into the other stack.
    await page.goto("/#/accept-invitation/some-invitation-id")
    const prompt = page.getByTestId("invitation-needs-signin")
    await expect(prompt).toBeVisible()
    await expect(prompt.locator('a[href="/login"]')).toHaveCount(0)
    await prompt.getByRole("button", { name: "Sign in" }).click()
    await expect(page.getByTestId("spa-login")).toBeVisible()
  })
})
