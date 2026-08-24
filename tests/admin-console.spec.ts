import { test, expect } from "@playwright/test"
import { signInThroughLoginForm, ADMIN, COACH, ORGANIZER, PLAYER } from "./helpers/auth"

// ADR 013. The dashboard stops being a demo harness and becomes a real admin
// surface, using the plugin endpoints that were configured in ADR 007 and had
// never worked — supplying custom ac/roles to admin() replaced the plugin's own,
// so the seeded admin held none of its permissions.

test.describe.serial("Admin console", () => {
  test("an admin sees the account list; the plugin's own permission check allows it", async ({ page }) => {
    // Before ADR 013 this endpoint answered "You are not allowed to list users"
    // for the one account that is supposed to be allowed.
    await signInThroughLoginForm(page, ADMIN)
    await page.goto("/dashboard")
    await expect(page.getByTestId("admin-console")).toBeVisible()
    await expect(page.getByTestId(`account-row-${COACH}`)).toBeVisible()
    await expect(page.getByTestId(`account-row-${ORGANIZER}`)).toBeVisible()
  })

  test("a non-admin sees no console at all", async ({ page }) => {
    await signInThroughLoginForm(page, COACH)
    await page.goto("/dashboard")
    await expect(page.getByTestId("role-badge")).toHaveText("coach")
    await expect(page.getByTestId("admin-console")).toHaveCount(0)
  })

  test("impersonation keeps the admin identity underneath", async ({ page }) => {
    await signInThroughLoginForm(page, ADMIN)
    await page.goto("/dashboard")
    await page.getByTestId(`impersonate-${COACH}`).click()

    // Now viewing as the coach…
    await expect(page.getByTestId("role-badge")).toHaveText("coach")
    await expect(page.getByTestId("impersonation-banner")).toBeVisible()
    // …and no console, because the coach has none.
    await expect(page.getByTestId("admin-console")).toHaveCount(0)

    // The distinction from the old switch-by-signing-in: the session records
    // who is behind the view. That column existed from migration 0003 and was
    // never written until now.
    const impersonatedBy = await page.evaluate(async () => {
      const r = await fetch("/api/auth/get-session")
      return (await r.json())?.session?.impersonatedBy ?? null
    })
    expect(impersonatedBy).toBeTruthy()
  })

  test("stopping impersonation returns to the admin, not a signed-out state", async ({ page }) => {
    // Self-contained: the `page` fixture is per-test even inside describe.serial,
    // so this cannot lean on the impersonation the previous test started.
    await signInThroughLoginForm(page, ADMIN)
    await page.goto("/dashboard")
    await page.getByTestId(`impersonate-${COACH}`).click()
    await expect(page.getByTestId("impersonation-banner")).toBeVisible()
    await page.getByTestId("stop-impersonating").click()
    await expect(page.getByTestId("role-badge")).toHaveText("admin")
    await expect(page.getByTestId("admin-console")).toBeVisible()
  })

  test("an admin can change someone's role, and it sticks", async ({ page }) => {
    await signInThroughLoginForm(page, ADMIN)
    await page.goto("/dashboard")
    await page.getByTestId(`role-select-${PLAYER}`).selectOption("referee")
    await expect(page.getByTestId(`role-select-${PLAYER}`)).toHaveValue("referee", { timeout: 15000 })

    // Put it back, so the six seeded actors keep the roles every other spec
    // expects. Leaking a role change would break authz.spec.ts intermittently.
    await page.getByTestId(`role-select-${PLAYER}`).selectOption("player")
    await expect(page.getByTestId(`role-select-${PLAYER}`)).toHaveValue("player", { timeout: 15000 })
  })

  test("banning is reflected in the list, and reversible", async ({ page }) => {
    await signInThroughLoginForm(page, ADMIN)
    await page.goto("/dashboard")
    await page.getByTestId(`ban-${PLAYER}`).click()
    await expect(page.getByTestId(`banned-${PLAYER}`)).toBeVisible({ timeout: 15000 })

    await page.getByTestId(`ban-${PLAYER}`).click()
    await expect(page.getByTestId(`banned-${PLAYER}`)).toHaveCount(0, { timeout: 15000 })
  })
})

test.describe("Admin endpoints refuse non-admins", () => {
  test("a coach cannot list users, however they ask", async ({ request, baseURL }) => {
    // The UI hides the console, but hiding is not enforcement — the endpoint
    // has to refuse on its own.
    const { signIn } = await import("./helpers/auth")
    await signIn(request, COACH)
    const res = await request.get("/api/auth/admin/list-users?limit=5", {
      headers: { Origin: baseURL! },
    })
    expect(res.status()).toBe(403)
  })

  test("a coach cannot impersonate anyone", async ({ request, baseURL }) => {
    const { signIn } = await import("./helpers/auth")
    await signIn(request, COACH)
    const users = await request.get("/api/teams")
    expect(users.ok()).toBeTruthy()
    const res = await request.post("/api/auth/admin/impersonate-user", {
      data: { userId: "anything" },
      headers: { Origin: baseURL! },
    })
    expect(res.status()).toBe(403)
  })
})
