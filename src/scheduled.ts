/**
 * The one thing that happens without somebody asking for it.
 *
 * Everything else in this Worker traces to a request: a score is entered
 * because a referee pressed a button, a push goes out because a write happened.
 * That property is what makes the system explainable, and a scheduler breaks
 * it — so this file is deliberately the whole of it. One trigger, one job, one
 * place to look when something arrives that nobody asked for.
 *
 * `EVENT_REMINDER` is why it exists. The PO's description names both windows:
 * "An event is starting soon (24h or 1h before)". There is no other way to send
 * that — it is the one notification whose cause is the passage of time rather
 * than an action.
 *
 * ## Three things that keep it comprehensible
 *
 * **It is idempotent, by claim rather than by clock.** The sender inserts into
 * `notification_sent` *before* it sends and treats a unique-constraint conflict
 * as "already done". Cron is not exactly-once — Cloudflare may retry a firing,
 * a deploy may overlap two runs, and a missed hour has to be recoverable on the
 * next one. A job that works out what to send from the clock alone survives
 * none of those, and the failure is somebody's phone buzzing twice at 6am.
 *
 * **It catches up rather than firing on an exact boundary.** The 24-hour window
 * is "starts within the next 24 hours and more than 1 hour away", not "starts in
 * exactly 24 hours". A missed run therefore sends late instead of not at all,
 * and the claim table stops the catch-up becoming a duplicate.
 *
 * **It reports what it did.** `mise run analytics` shows every run: how many
 * events matched, how many reminders were claimed, how many devices took them.
 * A scheduled job you cannot see is exactly the thing that makes a system hard
 * to reason about, and the reason to resist one — so this one is observable
 * before it is anything else.
 */

import { and, eq, gt, inArray, lte } from "drizzle-orm"
import { drizzle } from "drizzle-orm/d1"
import * as schema from "./db/schema"
import { track } from "./analytics"
import { inBatches } from "./api/relations"
import type { Bindings } from "./types"

/** The two windows the PO's description names. */
const WINDOWS = [
  { kind: "24h", from: 60 * 60 * 1000, to: 24 * 60 * 60 * 1000 },
  { kind: "1h", from: 0, to: 60 * 60 * 1000 },
] as const

/**
 * One pass. Exported so a test can call it directly with a fixed `now` — a
 * scheduled job that can only be exercised by waiting is one nobody tests.
 *
 * ## It enqueues; it no longer sends
 *
 * This used to call `notify` per due event inside one scheduled invocation, so
 * a busy hour had the identical subrequest exposure `announce()` just moved off
 * the request path — and the identical silence, because a throw in a cron
 * handler has no request to fail and nobody watching.
 *
 * ## The claim is NOT here
 *
 * It is in the consumer, and the reason is written where it lives, in
 * ./api/notify-queue.ts. In short: claiming here would record "sent" for
 * something not yet sent, so a message that exhausts its retries would be a
 * reminder lost for good. Claiming at consumption means a message that dies is
 * re-enqueued by the next sweep and recovered.
 *
 * What happens here instead is a *read* of the same table, to skip reminders
 * already sent. That is an optimisation — it keeps the queue quiet — and it is
 * allowed to be stale, because the consumer's claim is what makes a send
 * happen at most once.
 */
export async function sendDueReminders(env: Bindings, now = Date.now()): Promise<void> {
  const db = drizzle(env.DB, { schema })

  for (const window of WINDOWS) {
    // `startDate` is a day, not an instant: an event is a date in a diary, and
    // the venue's clock decides when its first game is. Midnight local is the
    // honest reading of "the day it starts", and it is what the schedule page
    // already shows.
    const from = new Date(now + window.from).toISOString().slice(0, 10)
    const to = new Date(now + window.to).toISOString().slice(0, 10)

    // `SEARCH event USING INDEX event_start_date_idx` since migration 0014.
    // This was `SCAN event`, and the cron went from hourly to every five
    // minutes in the same change — twelve times as many scans of a table that
    // only grows.
    const due = await db
      .select({ id: schema.event.id })
      .from(schema.event)
      .where(and(gt(schema.event.startDate, from), lte(schema.event.startDate, to)))
      .all()

    let queued = 0
    if (due.length > 0) {
      /**
       * Which of these have already been sent.
       *
       * Batched. `audience()` had a raw `inArray` over every user in the
       * audience and D1 failed the statement outright — "too many SQL
       * variables" — so a popular game notified nobody. This is the same shape
       * over every due event, and a busy weekend is exactly when it would
       * break. `MAX_IN` in ./api/relations.ts exists for this.
       */
      const ids = due.map((e) => e.id)
      const already = await inBatches(ids, (batch) =>
        db
          .select({ objectId: schema.notificationSent.objectId })
          .from(schema.notificationSent)
          .where(
            and(
              eq(schema.notificationSent.typeCode, "EVENT_REMINDER"),
              eq(schema.notificationSent.kind, window.kind),
              inArray(schema.notificationSent.objectId, batch),
            ),
          ),
      )
      const sent = new Set(already.map((r) => r.objectId))

      for (const event of due) {
        if (sent.has(event.id)) continue
        if (!env.NOTIFICATIONS) continue
        await env.NOTIFICATIONS.send({
          kind: "reminder",
          eventId: event.id,
          window: window.kind,
          occurredAt: new Date(now).toISOString(),
          offset: 0,
        })
        queued += 1
      }
    }

    /**
     * Every run, including the empty ones. "The cron fired and found nothing"
     * and "the cron did not fire" look identical without this, and they need
     * opposite responses.
     *
     * `reached` is 0 here now and always will be: this pass no longer delivers,
     * it enqueues. What was reached is `push.batch` with source
     * "queue:reminder", written by the consumer.
     */
    track(env, "reminder.run", {
      kind: window.kind,
      due: due.length,
      claimed: queued,
      reached: 0,
    })
  }
}

/**
 * What Cloudflare calls on the schedule.
 *
 * Wrapped, because an unhandled throw in a cron handler is invisible: there is
 * no request to 500 and nobody watching. Reported instead, so a broken run
 * shows up in `mise run analytics` beside everything else rather than nowhere.
 */
export async function scheduled(_event: ScheduledController, env: Bindings): Promise<void> {
  try {
    await sendDueReminders(env)
  } catch (err) {
    track(env, "api.threw", {
      route: "cron/reminders",
      method: "SCHEDULED",
      error: err instanceof Error ? err.name : "UnknownError",
      ms: 0,
      status: 500,
    })
  }
}
