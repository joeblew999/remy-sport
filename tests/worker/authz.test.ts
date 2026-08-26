import { SELF } from "cloudflare:test"
import { beforeAll, describe, expect, it } from "vitest"
import { ORIGIN, actorFor, post, seed, signIn } from "./helpers"

/**
 * The six-role permission matrix, in workerd.
 *
 * This is the repo's most valuable test and it never needed a browser: it
 * posts to `/api/events` as each actor and asserts 201 or 403. In Playwright it
 * cost a wrangler dev server, a Playwright runner and a slice of a 1.6-minute
 * suite. Here it is `SELF.fetch()` against the Worker in this process.
 *
 * Auth is real — a real OTP sign-in against real Better Auth against real
 * Miniflare D1. Nothing is mocked. That matters: the thing being asserted IS
 * the authorization, so a mock would assert only that the mock was written
 * correctly.
 *
 * `isolatedStorage` means this file owns its D1, so it can seed and create
 * freely without racing another spec — the contention that held Playwright to
 * two workers.
 */

const WRITERS = ["ADMIN", "ORGANIZER"]
const READERS = ["COACH", "PLAYER", "SPECTATOR", "REFEREE"]

beforeAll(seed)

describe("event:create — who may, by role", () => {
  for (const role of WRITERS) {
    it(`${role.toLowerCase()} CAN create an event`, async () => {
      const cookie = await signIn(actorFor(role))
      const res = await post(
        "/api/events",
        { names: { en: `${role} event` }, typeCode: "TOURNAMENT" },
        cookie,
      )
      expect(res.status).toBe(201)
    })
  }

  for (const role of READERS) {
    it(`${role.toLowerCase()} CANNOT create an event (403)`, async () => {
      const cookie = await signIn(actorFor(role))
      const res = await post(
        "/api/events",
        { names: { en: `${role} event` }, typeCode: "TOURNAMENT" },
        cookie,
      )
      expect(res.status).toBe(403)
    })
  }

  it("an anonymous caller gets 401, not 403", async () => {
    // The distinction matters: 403 would tell an anonymous caller the endpoint
    // exists and they are merely not permitted.
    const res = await post("/api/events", { names: { en: "x" }, typeCode: "TOURNAMENT" })
    expect(res.status).toBe(401)
  })
})

describe("event:read is public", () => {
  it("lists events without a session", async () => {
    const res = await SELF.fetch(`${ORIGIN}/api/events`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { events: unknown[] }
    expect(Array.isArray(body.events)).toBe(true)
  })

  it("404s an unknown id rather than leaking which ids exist", async () => {
    const res = await SELF.fetch(`${ORIGIN}/api/events/nope`)
    expect(res.status).toBe(404)
  })
})

describe("ownership — layer 2", () => {
  it("an organizer cannot update an event they did not create", async () => {
    const admin = await signIn(actorFor("ADMIN"))
    const created = await post(
      "/api/events",
      { names: { en: "Admin's event" }, typeCode: "TOURNAMENT" },
      admin,
    )
    const { id } = (await created.json()) as { id: string }

    const organizer = await signIn(actorFor("ORGANIZER"))
    const res = await SELF.fetch(`${ORIGIN}/api/events/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: organizer },
      body: JSON.stringify({ names: { en: "Hijacked" } }),
    })
    expect(res.status).toBe(403)
  })
})
