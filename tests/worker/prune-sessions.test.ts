import { describe, expect, it } from "vitest"
import { actorFor, api, signIn } from "./helpers"

/**
 * `POST /api/dev/prune-sessions` keeps the five most recent per user.
 *
 * The number is the point, not an implementation detail: the devices page is
 * only worth testing when a user has more than one session, so a prune that
 * wiped everything would leave the suite unable to exercise revoke. Five is
 * what the SQL says and five is what this asserts, because "it deleted some
 * rows" would pass against a `DELETE FROM session`.
 *
 * Written when the route moved from Hono to `dev.sessions.prune` in the oRPC
 * unification. The raw route had no test — it answered `c.json(...)`
 * unvalidated, so the window could have changed silently.
 */

describe("POST /api/dev/prune-sessions", () => {
  it("keeps the five most recent sessions for a user and drops the rest", async () => {
    const email = actorFor("COACH")
    // Seven sign-ins, seven session rows: two more than the window, so the
    // assertion below distinguishes "pruned to five" from "pruned to none".
    for (let i = 0; i < 7; i++) await signIn(email)

    const res = await api("/api/dev/prune-sessions", { method: "POST" })
    expect(res.status).toBe(200)

    const body = (await res.json()) as { before: number; after: number }
    expect(body.before).toBeGreaterThanOrEqual(7)
    expect(body.after).toBe(5)
  })
})
