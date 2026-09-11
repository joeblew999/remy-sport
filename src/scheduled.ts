/**
 * The one thing that happens without somebody asking for it.
 *
 * Everything else in this Worker traces to a request, which is what makes the
 * system explainable — so a scheduler is deliberately confined to this one
 * file. One trigger, one job, one place to look when something arrives that
 * nobody asked for.
 *
 * `EVENT_REMINDER` is why it exists: the one notification whose cause is the
 * passage of time rather than an action, at 24h and 1h before.
 *
 * ## Three things that keep it comprehensible
 *
 * **Idempotent by claim, not by clock.** The sender inserts into
 * `notification_sent` before it sends and treats a conflict as already done.
 * Cron is not exactly-once, and a job deriving what to send from the clock
 * alone fails as somebody's phone buzzing twice at 6am.
 *
 * **It catches up rather than firing on a boundary.** The window is "within the
 * next 24 hours and more than 1 hour away", so a missed run sends late instead
 * of not at all, and the claim stops the catch-up duplicating.
 *
 * **It reports what it did.** `bun run ops analytics` shows every run — events
 * matched, reminders claimed, devices reached. A scheduled job you cannot see
 * is the thing that makes a system hard to reason about.
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
 * **It enqueues; it no longer sends.** Calling `notify` per due event inside
 * one invocation had the same subrequest exposure `announce()` moved off the
 * request path, and the same silence — a throw in a cron handler has no request
 * to fail and nobody watching.
 *
 * **The claim is not here**; it is in the consumer, for reasons written in
 * ./api/notify-queue.ts. This only *reads* that table to skip sent reminders,
 * which is an optimisation and is allowed to be stale.
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
 * shows up in `bun run ops analytics` beside everything else rather than nowhere.
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
