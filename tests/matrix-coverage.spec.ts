import { test, expect } from "@playwright/test"
import { RESOURCES, ROUTE_MAP, PUBLIC_READS } from "../src/auth/matrix-data.gen"

/**
 * Matrix coverage test: verifies every resource+action in the access-control
 * matrix has a corresponding protected API route.
 *
 * All constants are imported from the generated src/auth/matrix-data.gen.ts
 * (source of truth: docs/matrix.json). No hard-coded data here.
 *
 * This test reads the live OpenAPI spec and checks:
 * 1. Every write permission maps to at least one protected endpoint
 * 2. Every protected endpoint rejects unauthenticated requests (401)
 * 3. Read-only endpoints are publicly accessible
 */

/** Build write-only permission routes (excluding "read" actions) from ROUTE_MAP. */
const WRITE_ROUTES: Record<string, { method: string; path: string }[]> = {}
for (const [key, routes] of Object.entries(ROUTE_MAP)) {
  const action = key.split(":")[1]
  if (action !== "read") {
    WRITE_ROUTES[key] = routes
  }
}

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

    for (const [key, routes] of Object.entries(WRITE_ROUTES)) {
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

    if (missing.length > 0) {
      throw new Error(
        `Access-control matrix has permissions without protected routes:\n` +
        missing.map((m) => `  - ${m}`).join("\n")
      )
    }
  })

  test("every protected route rejects unauthenticated requests (401)", async ({ request }) => {
    const failures: string[] = []

    for (const routes of Object.values(WRITE_ROUTES)) {
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

  test("matrix resource count matches expected (catches forgotten resources)", async () => {
    // RESOURCES is imported from generated matrix-data.ts — if someone adds a resource
    // to matrix.json and regenerates, this count auto-updates.
    expect(RESOURCES.length).toBe(11) // event, team, player, roster, score, bracket, fixture, session, attendance, court, user
  })
})
