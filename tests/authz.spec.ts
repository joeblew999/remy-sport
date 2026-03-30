import { test, expect } from "@playwright/test"

// All 6 actors from the access matrix (docs/user/matrix.md)
const ADMIN =     { email: "admin@remy.dev",     password: "admin1234!",   role: "admin" }
const ORGANIZER = { email: "organizer@remy.dev", password: "organizer1!",  role: "organizer" }
const COACH =     { email: "coach@remy.dev",     password: "coach12345!",  role: "coach" }
const PLAYER =    { email: "player@remy.dev",    password: "player1234!",  role: "player" }
const SPECTATOR = { email: "spectator@remy.dev", password: "spectator1!",  role: "spectator" }
const REFEREE =   { email: "referee@remy.dev",   password: "referee1234!", role: "referee" }

const ALL_ACTORS = [ADMIN, ORGANIZER, COACH, PLAYER, SPECTATOR, REFEREE]
const WRITERS = [ADMIN, ORGANIZER]  // can create/update/delete events
const READERS = [COACH, PLAYER, SPECTATOR, REFEREE]  // read-only for events

async function signIn(request: any, user: { email: string; password: string }) {
  const res = await request.post("/api/auth/sign-in/email", { data: user })
  expect(res.ok()).toBeTruthy()
  return res
}

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

  test("unauthenticated user gets 401", async ({ request }) => {
    const res = await request.post("/api/events", {
      data: { name: "Unauth", type: "tournament" },
    })
    expect(res.status()).toBe(401)
  })
})

// ── Layer 1: Role permission — event:read (public) ──────────────────────────

test.describe("Layer 1 — event:read is public", () => {
  test("unauthenticated user can list events", async ({ request }) => {
    const res = await request.get("/api/events")
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.events.length).toBeGreaterThan(0)
  })

  test("unauthenticated user can get single event", async ({ request }) => {
    const list = await request.get("/api/events")
    const { events } = await list.json()
    const res = await request.get(`/api/events/${events[0].id}`)
    expect(res.ok()).toBeTruthy()
    expect((await res.json()).id).toBe(events[0].id)
  })

  test("returns 404 for nonexistent event", async ({ request }) => {
    const res = await request.get("/api/events/nonexistent-id")
    expect(res.status()).toBe(404)
  })
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

// ── OpenAPI spec ────────────────────────────────────────────────────────────

test.describe("OpenAPI security documentation", () => {
  test("protected routes declare security schemes", async ({ request }) => {
    const res = await request.get("/openapi.json")
    const spec = await res.json()

    // POST /api/events requires auth
    const postEvents = spec.paths["/api/events"]?.post
    expect(postEvents.security).toContainEqual({ Session: [] })
    expect(postEvents.security).toContainEqual({ ApiKey: [] })
    expect(postEvents.responses["401"]).toBeTruthy()
    expect(postEvents.responses["403"]).toBeTruthy()

    // PUT and DELETE also require auth
    const putEvent = spec.paths["/api/events/{id}"]?.put
    expect(putEvent.security).toContainEqual({ Session: [] })
    const deleteEvent = spec.paths["/api/events/{id}"]?.delete
    expect(deleteEvent.security).toContainEqual({ Session: [] })

    // GET is public (no security)
    const getEvents = spec.paths["/api/events"]?.get
    expect(getEvents.security).toBeFalsy()
    const getEvent = spec.paths["/api/events/{id}"]?.get
    expect(getEvent.security).toBeFalsy()
  })
})

// ── Dashboard GUI — all actors ──────────────────────────────────────────────

test.describe.serial("Dashboard GUI — per-actor rendering", () => {
  test("redirects to login when not signed in", async ({ page }) => {
    await page.goto("/dashboard")
    await page.waitForURL("**/login")
  })

  for (const actor of WRITERS) {
    test(`${actor.role} sees create form and write permissions`, async ({ page }) => {
      await page.goto("/login")
      await page.fill('input[type="email"]', actor.email)
      await page.fill('input[type="password"]', actor.password)
      await page.click('button[type="submit"]')
      await page.waitForURL("**/")

      await page.goto("/dashboard")
      await expect(page.getByTestId("role-badge")).toHaveText(actor.role)
      await expect(page.getByTestId("create-event-form")).toBeVisible()
      await expect(page.getByTestId("perm-create")).toHaveClass(/badge-success/)
      await expect(page.getByTestId("perm-read")).toHaveClass(/badge-success/)
      await expect(page.getByTestId("perm-delete")).toHaveClass(/badge-success/)
    })
  }

  for (const actor of READERS) {
    test(`${actor.role} sees denied form and read-only permissions`, async ({ page }) => {
      await page.goto("/login")
      await page.fill('input[type="email"]', actor.email)
      await page.fill('input[type="password"]', actor.password)
      await page.click('button[type="submit"]')
      await page.waitForURL("**/")

      await page.goto("/dashboard")
      await expect(page.getByTestId("role-badge")).toHaveText(actor.role)
      await expect(page.getByTestId("create-event-denied")).toBeVisible()
      await expect(page.getByTestId("perm-create")).not.toHaveClass(/badge-success/)
      await expect(page.getByTestId("perm-read")).toHaveClass(/badge-success/)
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

  test("events table shows created events", async ({ page }) => {
    await page.goto("/login")
    await page.fill('input[type="email"]', ORGANIZER.email)
    await page.fill('input[type="password"]', ORGANIZER.password)
    await page.click('button[type="submit"]')
    await page.waitForURL("**/")

    await page.goto("/dashboard")
    const table = page.getByTestId("events-table")
    await expect(table).toBeVisible()
    await expect(table.locator("tbody tr")).not.toHaveCount(0)
  })
})
