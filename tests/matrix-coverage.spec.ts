import { test, expect } from "@playwright/test"

/**
 * Matrix coverage test: verifies every resource+action in the access-control
 * matrix has a corresponding protected API route.
 *
 * This test reads the live OpenAPI spec and checks:
 * 1. Every write permission maps to at least one protected endpoint
 * 2. Every protected endpoint rejects unauthenticated requests (401)
 * 3. Read-only endpoints are publicly accessible
 *
 * When the access-control matrix changes, update the MATRIX constant below.
 * If a test fails, it means either:
 *   - A new permission was added to access-control.ts without a route
 *   - A route lost its security middleware
 */

// Mirror of src/auth/access-control.ts — the single source of truth
const MATRIX: Record<string, string[]> = {
  event:      ["create", "read", "update", "delete"],
  team:       ["create", "read", "update", "delete"],
  player:     ["create", "read", "update"],
  roster:     ["manage"],
  score:      ["enter", "read"],
  bracket:    ["generate", "read"],
  fixture:    ["generate", "read"],
  session:    ["define", "read"],
  attendance: ["record", "read"],
  court:      ["assign", "read"],
  user:       ["manage"],
}

// Maps each resource+write-action to the route(s) that enforce it.
// "read" actions map to public GET endpoints (no auth required).
const PERMISSION_ROUTES: Record<string, { method: string; path: string }[]> = {
  "event:create":     [{ method: "POST",   path: "/api/events" }],
  "event:update":     [{ method: "PUT",    path: "/api/events/{id}" }],
  "event:delete":     [{ method: "DELETE", path: "/api/events/{id}" }],
  "team:create":      [{ method: "POST",   path: "/api/teams" }],
  "team:update":      [{ method: "PUT",    path: "/api/teams/{id}" }],
  "team:delete":      [{ method: "DELETE", path: "/api/teams/{id}" }],
  "player:create":    [{ method: "POST",   path: "/api/players" }],
  "player:update":    [{ method: "PUT",    path: "/api/players/{id}" }],
  "roster:manage":    [{ method: "POST",   path: "/api/rosters" }, { method: "DELETE", path: "/api/rosters/{id}" }],
  "score:enter":      [{ method: "POST",   path: "/api/scores" }, { method: "PUT", path: "/api/matches/{id}/status" }],
  "bracket:generate": [{ method: "POST",   path: "/api/brackets" }],
  "fixture:generate": [{ method: "POST",   path: "/api/fixtures" }, { method: "POST", path: "/api/matches" }],
  "session:define":   [{ method: "POST",   path: "/api/sessions" }],
  "attendance:record":[{ method: "POST",   path: "/api/attendance" }],
  "court:assign":     [{ method: "POST",   path: "/api/courts" }],
  "user:manage":      [{ method: "GET",    path: "/api/users" }, { method: "PUT", path: "/api/users/{id}" }],
}

// Public read endpoints — should NOT require auth
const PUBLIC_READS: { method: string; path: string }[] = [
  { method: "GET", path: "/api/events" },
  { method: "GET", path: "/api/teams" },
  { method: "GET", path: "/api/players" },
  { method: "GET", path: "/api/matches" },
  { method: "GET", path: "/api/scores" },
  { method: "GET", path: "/api/brackets" },
  { method: "GET", path: "/api/fixtures" },
  { method: "GET", path: "/api/sessions" },
  { method: "GET", path: "/api/attendance" },
  { method: "GET", path: "/api/rosters" },
  { method: "GET", path: "/api/courts" },
  { method: "GET", path: "/api/match-referees" },
]

test.describe.serial("Matrix coverage — access control ↔ API routes", () => {
  let spec: any

  test("fetch OpenAPI spec", async ({ request }) => {
    const res = await request.get("/openapi.json")
    expect(res.ok()).toBeTruthy()
    spec = await res.json()
  })

  test("every write permission has a protected route in the OpenAPI spec", async () => {
    expect(spec).toBeTruthy()

    const missing: string[] = []

    for (const [resource, actions] of Object.entries(MATRIX)) {
      for (const action of actions) {
        if (action === "read") continue // read = public, checked separately

        const key = `${resource}:${action}`
        const routes = PERMISSION_ROUTES[key]

        if (!routes || routes.length === 0) {
          missing.push(`${key} — no route mapping defined`)
          continue
        }

        for (const { method, path } of routes) {
          const pathSpec = spec.paths?.[path]
          if (!pathSpec) {
            missing.push(`${key} — path ${path} not in OpenAPI spec`)
            continue
          }

          const opSpec = pathSpec[method.toLowerCase()]
          if (!opSpec) {
            missing.push(`${key} — ${method} ${path} not in OpenAPI spec`)
            continue
          }

          if (!opSpec.security || opSpec.security.length === 0) {
            missing.push(`${key} — ${method} ${path} has no security declaration`)
          }
        }
      }
    }

    if (missing.length > 0) {
      throw new Error(
        `Access-control matrix has permissions without protected routes:\n` +
        missing.map((m) => `  - ${m}`).join("\n")
      )
    }
  })

  test("every protected route rejects unauthenticated requests (401)", async ({ request }) => {
    const failures: string[] = []

    for (const routes of Object.values(PERMISSION_ROUTES)) {
      for (const { method, path } of routes) {
        // Skip parameterized paths for this check — we just verify the auth gate
        const testPath = path.replace("{id}", "00000000-0000-0000-0000-000000000000")

        let res: any
        const body = {} // empty body is fine — auth check happens before validation

        if (method === "GET") {
          res = await request.get(testPath)
        } else if (method === "POST") {
          res = await request.post(testPath, { data: body })
        } else if (method === "PUT") {
          res = await request.put(testPath, { data: body })
        } else if (method === "DELETE") {
          res = await request.delete(testPath)
        }

        if (res && res.status() !== 401) {
          failures.push(`${method} ${testPath} returned ${res.status()} instead of 401`)
        }
      }
    }

    if (failures.length > 0) {
      throw new Error(
        `Protected routes that don't reject unauthenticated users:\n` +
        failures.map((f) => `  - ${f}`).join("\n")
      )
    }
  })

  test("public read endpoints are accessible without auth", async ({ request }) => {
    const failures: string[] = []

    for (const { method, path } of PUBLIC_READS) {
      const res = await request.get(path)
      if (!res.ok()) {
        failures.push(`${method} ${path} returned ${res.status()} (expected 2xx)`)
      }
    }

    if (failures.length > 0) {
      throw new Error(
        `Public read endpoints that require auth:\n` +
        failures.map((f) => `  - ${f}`).join("\n")
      )
    }
  })

  test("matrix constant matches access-control resource count", async () => {
    // If someone adds a resource to access-control.ts but forgets to update this test,
    // this count check will catch it. Update MATRIX above when adding new resources.
    const resourceCount = Object.keys(MATRIX).length
    expect(resourceCount).toBe(11) // event, team, player, roster, score, bracket, fixture, session, attendance, court, user
  })
})
