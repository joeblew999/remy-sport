/**
 * `POST /api/analytics` — the browser's way to report what happened to it.
 *
 * A beacon, not an oRPC procedure, and that shape is the whole point.
 * `navigator.sendBeacon` fires during page teardown and on a connection that
 * has just died — exactly when a normal fetch is cancelled, and exactly when the
 * event is most worth having. A beacon cannot read a response or retry, so
 * everything oRPC gives us here is unusable.
 *
 * **Unauthenticated, on purpose.** A session cookie may be absent — a spectator
 * watching a game who never signed in — or already discarded by a closing page.
 * Requiring one would drop precisely the sessions that went wrong and leave a
 * dataset that says the product works.
 *
 * The country is added here rather than trusted from the client: `request.cf`
 * has it already, it costs nothing, and it cannot be forged. It is also what
 * makes a failure rate legible — "6% of sessions fall back to WebSocket" is a
 * different problem in one country than in twenty.
 */

import { Hono } from "hono"
import type { AppEnv } from "../types"
import { track } from "../analytics"

const analytics = new Hono<AppEnv>()

analytics.post("/api/analytics", async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    event?: unknown
    blobs?: unknown
    doubles?: unknown
  } | null

  // A beacon cannot be told it was wrong, so a malformed one is dropped rather
  // than answered with a 400 nothing will read.
  if (typeof body?.event === "string" && body.event.length > 0 && body.event.length <= 64) {
    const cf = (c.req.raw as Request & { cf?: { country?: string } }).cf
    track(c.env, {
      event: body.event,
      blobs: [
        cf?.country,
        ...(Array.isArray(body.blobs) ? body.blobs.slice(0, 16).map(String) : []),
      ],
      doubles: Array.isArray(body.doubles)
        ? body.doubles.slice(0, 16).map((d) => (typeof d === "number" ? d : 0))
        : [],
    })
  }

  // 204 because the sender is not listening — often it no longer exists.
  return c.body(null, 204)
})

export default analytics
