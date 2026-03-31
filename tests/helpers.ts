import { expect } from "@playwright/test"
import { readFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Seed actors (matches src/routes/seed.ts) ────────────────────────────────

export const ADMIN =     { email: "admin@remy.dev",     password: "admin1234!",   role: "admin" } as const
export const ORGANIZER = { email: "organizer@remy.dev", password: "organizer1!",  role: "organizer" } as const
export const COACH =     { email: "coach@remy.dev",     password: "coach12345!",  role: "coach" } as const
export const PLAYER =    { email: "player@remy.dev",    password: "player1234!",  role: "player" } as const
export const SPECTATOR = { email: "spectator@remy.dev", password: "spectator1!",  role: "spectator" } as const
export const REFEREE =   { email: "referee@remy.dev",   password: "referee1234!", role: "referee" } as const

export type Actor = typeof ADMIN

export const ALL_ACTORS = [ADMIN, ORGANIZER, COACH, PLAYER, SPECTATOR, REFEREE] as const

// ── Matrix-driven role lookups ──────────────────────────────────────────────

const ACTOR_BY_ROLE: Record<string, Actor> = Object.fromEntries(
  ALL_ACTORS.map((a) => [a.role, a])
)

const matrix = JSON.parse(
  readFileSync(resolve(__dirname, "../docs/matrix.json"), "utf-8")
)

/** Actors whose role grants `action` on `resource` (from matrix.json). */
export function actorsCan(resource: string, action: string): Actor[] {
  const res = matrix.resources[resource]
  if (!res) throw new Error(`Unknown matrix resource: ${resource}`)
  return ALL_ACTORS.filter((a) => (res.roles[a.role] || []).includes(action))
}

/** Actors whose role does NOT grant `action` on `resource`. */
export function actorsCannot(resource: string, action: string): Actor[] {
  const res = matrix.resources[resource]
  if (!res) throw new Error(`Unknown matrix resource: ${resource}`)
  return ALL_ACTORS.filter((a) => !(res.roles[a.role] || []).includes(action))
}

// ── Helpers ─────────────────────────────────────────────────────────────────

export async function signIn(request: any, user: { email: string; password: string }) {
  const res = await request.post("/api/auth/sign-in/email", { data: user })
  expect(res.ok()).toBeTruthy()
  return res
}

export async function seed(request: any) {
  await request.post("/api/seed")
}

// ── Reusable test builders (DRY) ───────────────────────────────────────────

import { test } from "@playwright/test"

/**
 * Generates a full public-read test suite: seed → GET → verify array property.
 *
 *   describePublicRead("Standings", "/api/standings", "standings")
 */
export function describePublicRead(label: string, endpoint: string, property: string) {
  test.describe.serial(`${label} — public read`, () => {
    test("seed", async ({ request }) => {
      await request.post("/api/seed")
    })

    test(`GET ${endpoint} returns ${property}`, async ({ request }) => {
      const res = await request.get(endpoint)
      expect(res.ok()).toBeTruthy()
      const body = await res.json()
      expect(body).toHaveProperty(property)
      expect(Array.isArray(body[property])).toBeTruthy()
    })
  })
}

type Method = "get" | "post" | "put" | "delete"

/**
 * Generates CAN / CANNOT loops for a single resource:action.
 * Must be called inside a `test.describe.serial` block.
 *
 *   authzTests("division", "create", "post", "/api/divisions",
 *     (actor) => ({ eventId, name: `Div ${actor.role}` }),
 *     { status: 201, check: (body, actor) => expect(body.name).toBe(`Div ${actor.role}`) })
 */
export function authzTests(
  resource: string,
  action: string,
  method: Method,
  endpoint: string,
  dataFn: (actor: Actor) => any,
  opts: { status?: number; check?: (body: any, actor: Actor) => void } = {},
) {
  const allowed = actorsCan(resource, action)
  const denied = actorsCannot(resource, action)
  const expectedStatus = opts.status ?? (method === "post" ? 201 : 200)

  for (const actor of allowed) {
    test(`${actor.role} CAN ${action}`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request[method](endpoint, { data: dataFn(actor) })
      expect(res.status()).toBe(expectedStatus)
      if (opts.check) opts.check(await res.json(), actor)
    })
  }

  for (const actor of denied) {
    test(`${actor.role} CANNOT ${action} (403)`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request[method](endpoint, { data: dataFn(actor) })
      expect(res.status()).toBe(403)
    })
  }
}

/**
 * Generates a read-authz loop: CAN read → 200, CANNOT read → 403.
 * Must be called inside a `test.describe.serial` block.
 *
 *   authzReadTests("find-team", "read", "/api/find-team", "teams")
 */
export function authzReadTests(
  resource: string,
  action: string,
  endpoint: string,
  property: string,
) {
  for (const actor of actorsCan(resource, action)) {
    test(`${actor.role} CAN ${action}`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.get(endpoint)
      expect(res.ok()).toBeTruthy()
      expect(await res.json()).toHaveProperty(property)
    })
  }

  for (const actor of actorsCannot(resource, action)) {
    test(`${actor.role} CANNOT ${action} (403)`, async ({ request }) => {
      await signIn(request, actor)
      const res = await request.get(endpoint)
      expect(res.status()).toBe(403)
    })
  }
}
