import { test, expect } from "@playwright/test"

test.describe("Home page", () => {
  test("renders home page with title", async ({ page }) => {
    await page.goto("/")
    await expect(page.locator("h1")).toHaveText("Remy Sport")
  })

  test("has sign in link", async ({ page }) => {
    await page.goto("/")
    const signIn = page.locator('a[href="/login"]')
    await expect(signIn).toBeVisible()
  })

  test("has create account link", async ({ page }) => {
    await page.goto("/")
    const signUp = page.locator('a[href="/login?mode=signup"]')
    await expect(signUp).toBeVisible()
  })
})

test.describe("Health endpoint", () => {
  test("returns ok status", async ({ request }) => {
    const res = await request.get("/api/health")
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.status).toBe("ok")
    expect(body.timestamp).toBeTruthy()
  })
})

test.describe("OpenAPI doc", () => {
  test("returns valid OpenAPI spec", async ({ request }) => {
    const res = await request.get("/doc")
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.openapi).toBe("3.0.0")
    expect(body.info.title).toBe("Remy Sport API")
    expect(body.paths["/api/health"]).toBeTruthy()
  })
})
