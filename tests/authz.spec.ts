import { test, expect } from "@playwright/test"

// Seed users with roles (see ADR 005 / CONTEXT.md)
const ADMIN = { email: "admin@remy.dev", password: "admin1234!" }
const ORGANIZER = { email: "organizer@remy.dev", password: "organizer1!" }
const COACH = { email: "coach@remy.dev", password: "coach12345!" }
const SPECTATOR = { email: "user@remy.dev", password: "user12345!" }

async function signIn(request: any, user: { email: string; password: string }) {
  const res = await request.post("/api/auth/sign-in/email", { data: user })
  expect(res.ok()).toBeTruthy()
  return res
}

test.describe.serial("Authorization — API", () => {
  test("seed creates users with roles", async ({ request }) => {
    const res = await request.post("/api/seed")
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.seeded.length).toBeGreaterThanOrEqual(5)
  })

  test("unauthenticated user cannot create events", async ({ request }) => {
    const res = await request.post("/api/events", {
      data: { name: "Test Tournament", type: "tournament" },
    })
    expect(res.status()).toBe(401)
  })

  test("spectator cannot create events", async ({ request }) => {
    await signIn(request, SPECTATOR)
    const res = await request.post("/api/events", {
      data: { name: "Spectator Event", type: "tournament" },
    })
    expect(res.status()).toBe(403)
  })

  test("coach cannot create events", async ({ request }) => {
    await signIn(request, COACH)
    const res = await request.post("/api/events", {
      data: { name: "Coach Event", type: "league" },
    })
    expect(res.status()).toBe(403)
  })

  test("organizer can create events", async ({ request }) => {
    await signIn(request, ORGANIZER)
    const res = await request.post("/api/events", {
      data: { name: "Spring Tournament", type: "tournament", description: "Annual spring event" },
    })
    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body.name).toBe("Spring Tournament")
    expect(body.type).toBe("tournament")
  })

  test("admin can create events", async ({ request }) => {
    await signIn(request, ADMIN)
    const res = await request.post("/api/events", {
      data: { name: "Admin League", type: "league" },
    })
    expect(res.status()).toBe(201)
  })

  test("anyone can list events", async ({ request }) => {
    const res = await request.get("/api/events")
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.events.length).toBeGreaterThanOrEqual(2)
  })

  test("organizer can delete own event", async ({ request }) => {
    await signIn(request, ORGANIZER)
    // Create then delete
    const create = await request.post("/api/events", {
      data: { name: "To Delete", type: "camp" },
    })
    const event = await create.json()
    const del = await request.delete(`/api/events/${event.id}`)
    expect(del.ok()).toBeTruthy()
  })

  test("spectator cannot delete events", async ({ request }) => {
    // Get an event id
    const list = await request.get("/api/events")
    const { events } = await list.json()
    expect(events.length).toBeGreaterThan(0)

    await signIn(request, SPECTATOR)
    const res = await request.delete(`/api/events/${events[0].id}`)
    expect(res.status()).toBe(403)
  })
})

test.describe.serial("Authorization — Dashboard GUI", () => {
  test("redirects to login when not signed in", async ({ page }) => {
    await page.goto("/dashboard")
    await page.waitForURL("**/login")
  })

  test("organizer sees create form and permissions", async ({ page }) => {
    // Sign in as organizer
    await page.goto("/login")
    await page.fill('input[type="email"]', ORGANIZER.email)
    await page.fill('input[type="password"]', ORGANIZER.password)
    await page.click('button[type="submit"]')
    await page.waitForURL("**/")

    await page.goto("/dashboard")
    await expect(page.getByTestId("role-badge")).toHaveText("organizer")
    await expect(page.getByTestId("create-event-form")).toBeVisible()
    await expect(page.getByTestId("perm-create")).toHaveClass(/badge-success/)
    await expect(page.getByTestId("perm-read")).toHaveClass(/badge-success/)
    await expect(page.getByTestId("perm-delete")).toHaveClass(/badge-success/)
  })

  test("spectator sees denied create form", async ({ page }) => {
    await page.goto("/login")
    await page.fill('input[type="email"]', SPECTATOR.email)
    await page.fill('input[type="password"]', SPECTATOR.password)
    await page.click('button[type="submit"]')
    await page.waitForURL("**/")

    await page.goto("/dashboard")
    await expect(page.getByTestId("role-badge")).toHaveText("spectator")
    await expect(page.getByTestId("create-event-denied")).toBeVisible()
    await expect(page.getByTestId("perm-create")).not.toHaveClass(/badge-success/)
    await expect(page.getByTestId("perm-read")).toHaveClass(/badge-success/)
  })

  test("role switcher is visible", async ({ page }) => {
    await page.goto("/login")
    await page.fill('input[type="email"]', ADMIN.email)
    await page.fill('input[type="password"]', ADMIN.password)
    await page.click('button[type="submit"]')
    await page.waitForURL("**/")

    await page.goto("/dashboard")
    await expect(page.getByTestId("role-switcher")).toBeVisible()
    await expect(page.getByTestId("role-badge")).toHaveText("admin")
  })
})
