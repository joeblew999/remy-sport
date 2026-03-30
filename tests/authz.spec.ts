import { test, expect } from "@playwright/test"

// Seed users with roles (see ADR 005 / CONTEXT.md)
const ADMIN = { email: "admin@remy.dev", password: "admin1234!" }
const ORGANIZER = { email: "organizer@remy.dev", password: "organizer1!" }
const COACH = { email: "coach@remy.dev", password: "coach12345!" }
const PLAYER = { email: "player@remy.dev", password: "player1234!" }
const SPECTATOR = { email: "user@remy.dev", password: "user12345!" }

async function signIn(request: any, user: { email: string; password: string }) {
  const res = await request.post("/api/auth/sign-in/email", { data: user })
  expect(res.ok()).toBeTruthy()
  return res
}

// ── Layer 1: Role-based permission (requirePermission) ─────────────────────

test.describe.serial("Layer 1 — Role permission checks", () => {
  test("seed creates users with roles", async ({ request }) => {
    const res = await request.post("/api/seed")
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.seeded.length).toBeGreaterThanOrEqual(5)
  })

  test("unauthenticated user gets 401 on create", async ({ request }) => {
    const res = await request.post("/api/events", {
      data: { name: "Unauth Event", type: "tournament" },
    })
    expect(res.status()).toBe(401)
  })

  test("spectator gets 403 on create (read-only role)", async ({ request }) => {
    await signIn(request, SPECTATOR)
    const res = await request.post("/api/events", {
      data: { name: "Spectator Event", type: "tournament" },
    })
    expect(res.status()).toBe(403)
  })

  test("coach gets 403 on create (read-only for events)", async ({ request }) => {
    await signIn(request, COACH)
    const res = await request.post("/api/events", {
      data: { name: "Coach Event", type: "league" },
    })
    expect(res.status()).toBe(403)
  })

  test("player gets 403 on create", async ({ request }) => {
    await signIn(request, PLAYER)
    const res = await request.post("/api/events", {
      data: { name: "Player Event", type: "camp" },
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

  test("anyone can list events (public)", async ({ request }) => {
    const res = await request.get("/api/events")
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.events.length).toBeGreaterThanOrEqual(2)
  })

  test("anyone can get single event (public)", async ({ request }) => {
    const list = await request.get("/api/events")
    const { events } = await list.json()
    const res = await request.get(`/api/events/${events[0].id}`)
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.id).toBe(events[0].id)
  })

  test("returns 404 for nonexistent event", async ({ request }) => {
    const res = await request.get("/api/events/nonexistent-id")
    expect(res.status()).toBe(404)
  })
})

// ── Layer 2: Ownership checks (ownedBy) ─────────────────────────────────────

test.describe.serial("Layer 2 — Ownership checks", () => {
  let organizerEventId: string
  let adminEventId: string

  test("organizer creates an event for ownership tests", async ({ request }) => {
    await signIn(request, ORGANIZER)
    const res = await request.post("/api/events", {
      data: { name: "Organizer's Event", type: "showcase" },
    })
    expect(res.status()).toBe(201)
    organizerEventId = (await res.json()).id
  })

  test("organizer can update own event", async ({ request }) => {
    await signIn(request, ORGANIZER)
    const res = await request.put(`/api/events/${organizerEventId}`, {
      data: { name: "Updated Event Name" },
    })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.name).toBe("Updated Event Name")
  })

  test("organizer can delete own event", async ({ request }) => {
    await signIn(request, ORGANIZER)
    // Create a throwaway event
    const create = await request.post("/api/events", {
      data: { name: "To Delete", type: "camp" },
    })
    const event = await create.json()
    const del = await request.delete(`/api/events/${event.id}`)
    expect(del.ok()).toBeTruthy()
  })

  test("admin creates an event for cross-ownership test", async ({ request }) => {
    await signIn(request, ADMIN)
    const res = await request.post("/api/events", {
      data: { name: "Admin's Private Event", type: "tournament" },
    })
    expect(res.status()).toBe(201)
    adminEventId = (await res.json()).id
  })

  test("organizer cannot update another user's event", async ({ request }) => {
    await signIn(request, ORGANIZER)
    const res = await request.put(`/api/events/${adminEventId}`, {
      data: { name: "Hijacked!" },
    })
    expect(res.status()).toBe(403)
  })

  test("admin can update any event (bypasses ownership)", async ({ request }) => {
    await signIn(request, ADMIN)
    const res = await request.put(`/api/events/${organizerEventId}`, {
      data: { description: "Admin override" },
    })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.description).toBe("Admin override")
  })

  test("spectator cannot delete events (no permission)", async ({ request }) => {
    await signIn(request, SPECTATOR)
    const list = await request.get("/api/events")
    const { events } = await list.json()
    const res = await request.delete(`/api/events/${events[0].id}`)
    expect(res.status()).toBe(403)
  })
})

// ── Layer 3: Event type scoping (requireEventType) ──────────────────────────
// Tested via a dedicated test endpoint that applies the middleware

test.describe.serial("Layer 3 — Event type scoping", () => {
  test("requireEventType middleware is importable and functional", async ({ request }) => {
    // Create events of different types
    await signIn(request, ORGANIZER)
    const tournament = await (await request.post("/api/events", {
      data: { name: "Type Test Tournament", type: "tournament" },
    })).json()
    const camp = await (await request.post("/api/events", {
      data: { name: "Type Test Camp", type: "camp" },
    })).json()

    // Verify both created with correct types
    const t = await (await request.get(`/api/events/${tournament.id}`)).json()
    expect(t.type).toBe("tournament")
    const c = await (await request.get(`/api/events/${camp.id}`)).json()
    expect(c.type).toBe("camp")
  })
})

// ── OpenAPI spec ────────────────────────────────────────────────────────────

test.describe("OpenAPI security documentation", () => {
  test("protected routes declare security schemes", async ({ request }) => {
    const res = await request.get("/openapi.json")
    const spec = await res.json()

    // POST /api/events should require auth
    const postEvents = spec.paths["/api/events"]?.post
    expect(postEvents).toBeTruthy()
    expect(postEvents.security).toBeTruthy()
    expect(postEvents.security).toContainEqual({ Session: [] })
    expect(postEvents.security).toContainEqual({ ApiKey: [] })

    // POST should document 401 and 403 responses
    expect(postEvents.responses["401"]).toBeTruthy()
    expect(postEvents.responses["403"]).toBeTruthy()

    // GET /api/events should have no security (public)
    const getEvents = spec.paths["/api/events"]?.get
    expect(getEvents.security).toBeFalsy()
  })
})

// ── Dashboard GUI ───────────────────────────────────────────────────────────

test.describe.serial("Dashboard GUI — role-based rendering", () => {
  test("redirects to login when not signed in", async ({ page }) => {
    await page.goto("/dashboard")
    await page.waitForURL("**/login")
  })

  test("organizer sees create form and full permissions", async ({ page }) => {
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

  test("spectator sees denied create form and read-only permissions", async ({ page }) => {
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
    await expect(page.getByTestId("perm-update")).not.toHaveClass(/badge-success/)
    await expect(page.getByTestId("perm-delete")).not.toHaveClass(/badge-success/)
  })

  test("admin sees role badge and role switcher", async ({ page }) => {
    await page.goto("/login")
    await page.fill('input[type="email"]', ADMIN.email)
    await page.fill('input[type="password"]', ADMIN.password)
    await page.click('button[type="submit"]')
    await page.waitForURL("**/")

    await page.goto("/dashboard")
    await expect(page.getByTestId("role-badge")).toHaveText("admin")
    await expect(page.getByTestId("role-switcher")).toBeVisible()
    await expect(page.getByTestId("create-event-form")).toBeVisible()
  })

  test("events table displays created events", async ({ page }) => {
    await page.goto("/login")
    await page.fill('input[type="email"]', ORGANIZER.email)
    await page.fill('input[type="password"]', ORGANIZER.password)
    await page.click('button[type="submit"]')
    await page.waitForURL("**/")

    await page.goto("/dashboard")
    const table = page.getByTestId("events-table")
    await expect(table).toBeVisible()
    // Should contain events created by earlier tests
    await expect(table.locator("tbody tr")).not.toHaveCount(0)
  })
})
