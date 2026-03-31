import { test, expect } from "@playwright/test"
import { ADMIN, ORGANIZER, COACH, PLAYER, SPECTATOR, REFEREE, ALL_ACTORS, signIn, actorsCan, actorsCannot } from "./helpers"
import { RESOURCES } from "../src/auth/matrix-data.gen"

const WRITERS = actorsCan("event", "create")
const READERS = actorsCannot("event", "create")

// ── Seed ────────────────────────────────────────────────────────────────────

test.describe.serial("Seed — all 6 actors", () => {
  test("seed creates all actor accounts with correct roles", async ({ request }) => {
    const res = await request.post("/api/seed")
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.seeded).toHaveLength(6)
    for (const actor of ALL_ACTORS) {
      const seeded = body.seeded.find((s: any) => s.email === actor.email)
      expect(seeded).toBeTruthy()
      expect(seeded.role).toBe(actor.role)
    }
  })

  for (const actor of ALL_ACTORS) {
    test(`${actor.role} can sign in`, async ({ request }) => {
      const res = await request.post("/api/auth/sign-in/email", {
        data: { email: actor.email, password: actor.password },
      })
      expect(res.ok()).toBeTruthy()
      const body = await res.json()
      expect(body.user.email).toBe(actor.email)
    })
  }
})

// ── Layer 1: Role permission — event:create ─────────────────────────────────

test.describe.serial("Layer 1 — event:create by role", () => {
  for (const actor of WRITERS) {
    test(`${actor.role} CAN create events`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/events", {
        data: { name: `${actor.role}'s event`, type: "tournament" },
      })
      expect(res.status()).toBe(201)
    })
  }

  for (const actor of READERS) {
    test(`${actor.role} CANNOT create events (403)`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.post("/api/events", {
        data: { name: `${actor.role} attempt`, type: "tournament" },
      })
      expect(res.status()).toBe(403)
    })
  }
})

// ── Layer 2: Ownership — update/delete ──────────────────────────────────────

test.describe.serial("Layer 2 — ownership on update/delete", () => {
  let organizerEventId: string
  let adminEventId: string

  test("organizer creates event", async ({ request }) => {
    await signIn(request, ORGANIZER)
    const res = await request.post("/api/events", {
      data: { name: "Organizer Owned", type: "showcase" },
    })
    organizerEventId = (await res.json()).id
  })

  test("admin creates event", async ({ request }) => {
    await signIn(request, ADMIN)
    const res = await request.post("/api/events", {
      data: { name: "Admin Owned", type: "league" },
    })
    adminEventId = (await res.json()).id
  })

  test("organizer can update own event", async ({ request }) => {
    await signIn(request, ORGANIZER)
    const res = await request.put(`/api/events/${organizerEventId}`, {
      data: { name: "Updated by Owner" },
    })
    expect(res.ok()).toBeTruthy()
    expect((await res.json()).name).toBe("Updated by Owner")
  })

  test("organizer CANNOT update admin's event (ownership denied)", async ({ request }) => {
    await signIn(request, ORGANIZER)
    const res = await request.put(`/api/events/${adminEventId}`, {
      data: { name: "Hijacked!" },
    })
    expect(res.status()).toBe(403)
  })

  test("admin CAN update organizer's event (admin bypass)", async ({ request }) => {
    await signIn(request, ADMIN)
    const res = await request.put(`/api/events/${organizerEventId}`, {
      data: { description: "Admin override" },
    })
    expect(res.ok()).toBeTruthy()
    expect((await res.json()).description).toBe("Admin override")
  })

  test("organizer can delete own event", async ({ request }) => {
    await signIn(request, ORGANIZER)
    const create = await request.post("/api/events", {
      data: { name: "Throwaway", type: "camp" },
    })
    const id = (await create.json()).id
    const del = await request.delete(`/api/events/${id}`)
    expect(del.ok()).toBeTruthy()
  })

  test("organizer CANNOT delete admin's event (ownership denied)", async ({ request }) => {
    await signIn(request, ORGANIZER)
    const res = await request.delete(`/api/events/${adminEventId}`)
    expect(res.status()).toBe(403)
  })

  for (const actor of READERS) {
    test(`${actor.role} CANNOT delete any event (no permission)`, async ({ request }) => {
      await signIn(request, actor)
      const list = await request.get("/api/events")
      const { events } = await list.json()
      const res = await request.delete(`/api/events/${events[0].id}`)
      expect(res.status()).toBe(403)
    })
  }

  for (const actor of READERS) {
    test(`${actor.role} CANNOT update any event (no permission)`, async ({ request }) => {
      await signIn(request, actor)
      const list = await request.get("/api/events")
      const { events } = await list.json()
      const res = await request.put(`/api/events/${events[0].id}`, {
        data: { name: "Nope" },
      })
      expect(res.status()).toBe(403)
    })
  }
})

// ── Layer 3: Event type scoping ─────────────────────────────────────────────

test.describe.serial("Layer 3 — event types", () => {
  test("all 4 event types can be created", async ({ request }) => {
    await signIn(request, ORGANIZER)
    for (const type of ["tournament", "league", "camp", "showcase"]) {
      const res = await request.post("/api/events", {
        data: { name: `Type test: ${type}`, type },
      })
      expect(res.status(), `should create ${type}`).toBe(201)
      expect((await res.json()).type).toBe(type)
    }
  })

  test("events are stored with correct types", async ({ request }) => {
    const res = await request.get("/api/events")
    const { events } = await res.json()
    const types = new Set(events.map((e: any) => e.type))
    expect(types).toContain("tournament")
    expect(types).toContain("league")
    expect(types).toContain("camp")
    expect(types).toContain("showcase")
  })
})

// ── Dashboard GUI — data-driven matrix explorer ─────────────────────────────

test.describe.serial("Dashboard GUI — per-actor rendering", () => {
  test("redirects to login when not signed in", async ({ page }) => {
    await page.goto("/dashboard")
    await page.waitForURL("**/login")
  })

  for (const actor of WRITERS) {
    test(`${actor.role} sees permission matrix with write access`, async ({ page }) => {
      await page.goto("/login")
      await page.fill('input[type="email"]', actor.email)
      await page.fill('input[type="password"]', actor.password)
      await page.click('button[type="submit"]')
      await page.waitForURL("**/")

      await page.goto("/dashboard")
      await expect(page.getByTestId("role-badge")).toHaveText(actor.role)
      await expect(page.getByTestId("permission-matrix")).toBeVisible()
      // Writers should see event:create as allowed (green badge)
      await expect(page.getByTestId("perm-event-create")).toHaveClass(/badge-success/)
      await expect(page.getByTestId("perm-event-read")).toHaveClass(/badge-success/)
    })
  }

  for (const actor of READERS) {
    test(`${actor.role} sees permission matrix with read-only access`, async ({ page }) => {
      await page.goto("/login")
      await page.fill('input[type="email"]', actor.email)
      await page.fill('input[type="password"]', actor.password)
      await page.click('button[type="submit"]')
      await page.waitForURL("**/")

      await page.goto("/dashboard")
      await expect(page.getByTestId("role-badge")).toHaveText(actor.role)
      await expect(page.getByTestId("permission-matrix")).toBeVisible()
      // Readers should NOT have event:create
      await expect(page.getByTestId("perm-event-create")).not.toHaveClass(/badge-success/)
      await expect(page.getByTestId("perm-event-read")).toHaveClass(/badge-success/)
    })
  }

  test("role switcher shows all 6 actors", async ({ page }) => {
    await page.goto("/login")
    await page.fill('input[type="email"]', ADMIN.email)
    await page.fill('input[type="password"]', ADMIN.password)
    await page.click('button[type="submit"]')
    await page.waitForURL("**/")

    await page.goto("/dashboard")
    const switcher = page.getByTestId("role-switcher")
    await expect(switcher).toBeVisible()
    await expect(switcher.locator("button")).toHaveCount(6)
  })

  test("permission matrix shows all resources", async ({ page }) => {
    await page.goto("/login")
    await page.fill('input[type="email"]', ADMIN.email)
    await page.fill('input[type="password"]', ADMIN.password)
    await page.click('button[type="submit"]')
    await page.waitForURL("**/")

    await page.goto("/dashboard")
    const matrix = page.getByTestId("permission-matrix")
    await expect(matrix).toBeVisible()
    // Admin should see all resource rows (count from generated matrix-data)
    await expect(matrix.locator("tbody tr")).toHaveCount(RESOURCES.length)
  })

  test("resource explorer is present", async ({ page }) => {
    await page.goto("/login")
    await page.fill('input[type="email"]', ADMIN.email)
    await page.fill('input[type="password"]', ADMIN.password)
    await page.click('button[type="submit"]')
    await page.waitForURL("**/")

    await page.goto("/dashboard")
    await expect(page.getByTestId("resource-explorer")).toBeVisible()
    await expect(page.getByTestId("action-log")).toBeVisible()
  })
})

// ── Bearer token + API key auth ─────────────────────────────────────────────

test.describe.serial("Bearer token auth", () => {
  test("can authenticate API calls with bearer token", async ({ request }) => {
    const signInRes = await request.post("/api/auth/sign-in/email", {
      data: { email: ORGANIZER.email, password: ORGANIZER.password },
    })
    const { token } = await signInRes.json()
    expect(token).toBeTruthy()

    const res = await request.post("/api/events", {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: "Bearer Token Event", type: "tournament" },
    })
    expect(res.status()).toBe(201)
    expect((await res.json()).name).toBe("Bearer Token Event")
  })

  test("invalid bearer token gets 401", async ({ request }) => {
    const res = await request.post("/api/events", {
      headers: { Authorization: "Bearer invalid-token-here" },
      data: { name: "Should Fail", type: "tournament" },
    })
    expect(res.status()).toBe(401)
  })
})

test.describe.serial("API key auth", () => {
  test("seed returns API keys", async ({ request }) => {
    const res = await request.post("/api/seed")
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.apiKeys).toBeTruthy()
    expect(body.apiKeys.length).toBeGreaterThanOrEqual(2)
  })

  test("can authenticate with x-api-key header", async ({ request }) => {
    const seedRes = await request.post("/api/seed")
    const { apiKeys } = await seedRes.json()
    const adminKey = apiKeys.find((k: any) => k.email === "admin@remy.dev")

    if (!adminKey?.key) return

    const res = await request.get("/api/events", {
      headers: { "x-api-key": adminKey.key },
    })
    expect(res.ok()).toBeTruthy()
  })
})
