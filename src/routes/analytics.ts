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
 * different problem in one country than in twenty. It is passed as `country`
 * rather than pushed onto the front of `blobs`, so it lands in the same column
 * here as it does everywhere else.
 */

import { Hono } from "hono"
import type { AppEnv } from "../types"
import { EVENTS, isEventName, keepsEventsLocally, recent, trackDynamic, type EventSpec } from "../analytics"

const analytics = new Hono<AppEnv>()

analytics.post("/api/analytics", async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    event?: unknown
    fields?: unknown
  } | null

  // A beacon cannot be told it was wrong, so a malformed one is dropped rather
  // than answered with a 400 nothing will read.
  //
  // The event name is checked against the catalogue rather than merely being a
  // short string. Anyone can POST here — it is deliberately unauthenticated —
  // and without this the dataset is an open bucket that a bored person can fill
  // with event names nobody defined, which is the same thing as losing it.
  if (isEventName(body?.event) && body.fields && typeof body.fields === "object") {
    const spec: EventSpec = EVENTS[body.event]
    const sent = body.fields as Record<string, unknown>
    // Only declared fields, coerced to their declared kind. An undeclared key
    // would have nowhere to go, and a number where a string belongs would land
    // in the wrong sort of column.
    const fields: Record<string, string | number> = {}
    for (const k of spec.blobs) if (k in sent) fields[k] = String(sent[k]).slice(0, 256)
    for (const k of spec.doubles) fields[k] = Number(sent[k]) || 0

    const cf = (c.req.raw as Request & { cf?: { country?: string } }).cf
    // `trackDynamic`, not `track`: the event name came off the wire. It has
    // been checked against the catalogue and the fields filtered to the ones it
    // declares, but that is a runtime fact and no type can assert it. The
    // honest signature says so instead of a cast pretending otherwise.
    trackDynamic(c.env, body.event, fields, cf?.country)
  }

  // 204 because the sender is not listening — often it no longer exists.
  return c.body(null, 204)
})

/**
 * `GET /api/dev/events` — the same telemetry, when there is no dataset to send
 * it to.
 *
 * **Guarded by the same predicate that decides whether the ring is filled at
 * all**, so the endpoint cannot exist without data behind it or vice versa. On
 * a deployment `MAIL_TRANSPORT=cloudflare`, nothing is kept, and this 404s —
 * the same rule, and the same one line, as `/api/dev/outbox`.
 *
 * An earlier version guarded on the *binding* being absent, which sounded
 * self-enforcing and was wrong: wrangler dev binds Analytics Engine and quietly
 * discards the writes, so the ring stayed empty and this always 404'd.
 */
analytics.get("/api/dev/events", (c) => {
  if (!keepsEventsLocally(c.env)) return c.notFound()
  return c.json({ events: recent() })
})

export default analytics
