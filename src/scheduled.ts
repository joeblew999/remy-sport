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

import { and, gt, lte } from "drizzle-orm"
import { drizzle } from "drizzle-orm/d1"
import * as schema from "./db/schema"
import { notify } from "./api/push"
import { track } from "./analytics"
import { pick, type Names } from "./domain/names"
import { m } from "./paraglide/messages.js"
import type { Bindings } from "./types"

/** The two windows the PO's description names. */
const WINDOWS = [
  { kind: "24h", from: 60 * 60 * 1000, to: 24 * 60 * 60 * 1000 },
  { kind: "1h", from: 0, to: 60 * 60 * 1000 },
] as const

/**
 * Claim the right to send, or discover somebody already has.
 *
 * `onConflictDoNothing` plus a changed-row count, which is one statement and
 * therefore atomic. The obvious alternative — read, then write if absent — has
 * two concurrent runs both read nothing and both send.
 */
async function claim(
  db: ReturnType<typeof drizzle<typeof schema>>,
  objectId: string,
  kind: string,
): Promise<boolean> {
  const res = await db
    .insert(schema.notificationSent)
    .values({
      objectTypeCode: "EVENT",
      objectId,
      typeCode: "EVENT_REMINDER",
      kind,
      sentAt: new Date().toISOString(),
    })
    .onConflictDoNothing()
  return res.meta.changes > 0
}

/**
 * One pass. Exported so a test can call it directly with a fixed `now` — a
 * scheduled job that can only be exercised by waiting is one nobody tests.
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

    const due = await db
      .select({ id: schema.event.id, names: schema.event.names, startDate: schema.event.startDate })
      .from(schema.event)
      .where(and(gt(schema.event.startDate, from), lte(schema.event.startDate, to)))
      .all()

    let claimed = 0
    let reached = 0
    for (const event of due) {
      // Claim first, send second. The other order re-sends every time a run
      // overlaps another.
      if (!(await claim(db, event.id, window.kind))) continue
      claimed += 1

      const result = await notify(db, env, {
        typeCode: "EVENT_REMINDER",
        targets: [{ objectTypeCode: "EVENT", objectId: event.id }],
        // One key per event and window, so a retry that got past the claim
        // still replaces rather than stacks.
        tag: `reminder:${event.id}:${window.kind}`,
        render: (locale) => ({
          title: m.push_event_reminder_title(
            { event: pick(event.names as Names, locale) },
            { locale },
          ),
          body: m.push_event_reminder_body({}, { locale }),
          url: `/#/event/${event.id}`,
        }),
      })
      reached += result.sent
    }

    // Every run, including the empty ones. "The cron fired and found nothing"
    // and "the cron did not fire" look identical without this, and they need
    // opposite responses.
    track(env, "reminder.run", {
      kind: window.kind,
      due: due.length,
      claimed,
      reached,
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
