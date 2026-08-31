import { env } from "cloudflare:test"
import { drizzle } from "drizzle-orm/d1"
import { and, eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"
import * as schema from "../../src/db/schema"
import { sendDueReminders } from "../../src/scheduled"
import { runNotificationJob } from "../../src/api/notify-queue"
import type { Bindings } from "../../src/types"
import { SEED_ENTITIES } from "../../src/domain/model/entities"

/**
 * The one thing in this Worker that happens without somebody asking for it.
 *
 * A scheduled job that can only be exercised by waiting is one nobody tests, so
 * `sendDueReminders` takes `now` — every case here is a fixed clock and a fixed
 * database, with no cron involved.
 *
 * What is actually being asserted is not "a reminder goes out". It is that
 * running the job twice does not send twice, which is the property Cloudflare's
 * cron does not give you: a firing may be retried, a deploy may overlap two
 * runs, and a missed hour has to be recoverable on the next one. The failure
 * mode is somebody's phone buzzing twice at six in the morning.
 */

const db = () => drizzle(env.DB, { schema })

/**
 * An event on a given day, with nothing following it — this is about claims.
 *
 * The organiser is a seeded one rather than an invented id: `organizer_user_id`
 * is NOT NULL with a foreign key, so a made-up value fails at the database and
 * the error arrives from the insert rather than from the thing being tested.
 */
const ORGANISER = SEED_ENTITIES.users.find((u) => u.roleCode === "ORGANIZER")!.id

async function eventOn(id: string, startDate: string) {
  await db()
    .insert(schema.event)
    .values({
      id,
      name: id,
      names: { en: id },
      typeCode: "TOURNAMENT",
      formatCode: "5x5",
      description: null,
      startDate,
      endDate: startDate,
      cityCode: null,
      provinceCode: null,
      timezone: "Asia/Bangkok",
      isFibaCertified: false,
      orgId: null,
      organizerUserId: ORGANISER,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing()
}

const claims = (objectId: string) =>
  db()
    .select({ kind: schema.notificationSent.kind })
    .from(schema.notificationSent)
    .where(
      and(
        eq(schema.notificationSent.objectId, objectId),
        eq(schema.notificationSent.typeCode, "EVENT_REMINDER"),
      ),
    )
    .all()

// A fixed instant so the windows are arithmetic rather than a race with the
// clock: a test that computes "tomorrow" from Date.now() fails at midnight.
const NOW = Date.parse("2026-06-10T09:00:00Z")
const day = (offsetDays: number) =>
  new Date(NOW + offsetDays * 86_400_000).toISOString().slice(0, 10)

/**
 * The sweep and the consumer, run end to end.
 *
 * Delivery moved onto a queue, and with it the claim: `sendDueReminders` now
 * enqueues and `runNotificationJob` claims. So a test that only ran the sweep
 * would assert on a claim table nothing had written — these run both halves,
 * which is also the only way to exercise the seam.
 */
const sweepAndConsume = async (now: number) => {
  const queued: unknown[] = []
  const env2 = {
    ...(env as unknown as Record<string, unknown>),
    NOTIFICATIONS: { send: async (b: unknown) => void queued.push(b) },
  } as unknown as Bindings
  await sendDueReminders(env2, now)
  for (const job of queued) await runNotificationJob(db(), env2, job as never)
  return queued
}

describe("The reminder job", () => {
  beforeEach(async () => {
    await db().delete(schema.notificationSent)
  })

  it("claims a 24-hour reminder for an event starting tomorrow", async () => {
    await eventOn("cron-tomorrow", day(1))
    await sweepAndConsume(NOW)
    expect((await claims("cron-tomorrow")).map((c) => c.kind)).toContain("24h")
  })

  it("does not claim it twice, however often the job runs", async () => {
    // The whole point. Cron is not exactly-once, so this is the ordinary case
    // rather than an edge one.
    await eventOn("cron-twice", day(1))
    await sweepAndConsume(NOW)
    await sweepAndConsume(NOW)
    await sweepAndConsume(NOW)
    expect((await claims("cron-twice")).filter((c) => c.kind === "24h")).toHaveLength(1)
  })

  it("leaves an event far in the future alone", async () => {
    await eventOn("cron-far", day(30))
    await sweepAndConsume(NOW)
    expect(await claims("cron-far")).toHaveLength(0)
  })

  it("leaves an event that has already started alone", async () => {
    // A reminder for something that began yesterday is not a reminder.
    await eventOn("cron-past", day(-1))
    await sweepAndConsume(NOW)
    expect(await claims("cron-past")).toHaveLength(0)
  })

  it("sends the one-hour warning separately from the day-before one", async () => {
    // Two announcements about one event, not one sent twice — which is why
    // `kind` is part of the unique key.
    await eventOn("cron-both", day(1))
    await sweepAndConsume(NOW)
    expect((await claims("cron-both")).map((c) => c.kind)).toEqual(["24h"])

    // Now stand at the day itself: the 1h window covers today.
    await sweepAndConsume(Date.parse("2026-06-10T23:30:00Z"))
    expect((await claims("cron-both")).map((c) => c.kind).sort()).toEqual(["1h", "24h"])
  })

  it("catches up a missed run rather than skipping it", async () => {
    // The window is "within the next 24 hours", not "in exactly 24 hours", so a
    // job that did not run for six hours still sends — late, once.
    await eventOn("cron-late", day(1))
    await sweepAndConsume(NOW + 6 * 3_600_000)
    expect((await claims("cron-late")).map((c) => c.kind)).toContain("24h")
  })
})

/**
 * Where the claim lives, and what moving it would cost.
 *
 * `notification_sent` is claimed at *consumption*, not when the sweep enqueues.
 * The difference only shows up when a message fails, which is exactly when
 * nobody is looking — so it is asserted here rather than left to the comment.
 */
describe("The claim is in the consumer, not the sweep", () => {
  beforeEach(async () => {
    await db().delete(schema.notificationSent)
  })

  const sweepOnly = async (now: number) => {
    const queued: unknown[] = []
    const env2 = {
      ...(env as unknown as Record<string, unknown>),
      NOTIFICATIONS: { send: async (b: unknown) => void queued.push(b) },
    } as unknown as Bindings
    await sendDueReminders(env2, now)
    // Filtered by caller: this file shares one database across its tests, so
    // every event an earlier test created is still in the window and still
    // enqueued. Asserting on position would be asserting on test order.
    const forEvent = (id: string) =>
      queued.filter((j) => (j as { eventId?: string }).eventId === id)
    return { queued, forEvent, env2 }
  }

  it("a swept-but-never-consumed reminder is recovered by the next sweep", async () => {
    // The case that decides it. If the sweep claimed, this message dying in the
    // dead letter queue would be a reminder lost for good — the claim row would
    // say "sent" and no later sweep would try again. Claiming at consumption
    // means the next sweep picks it up.
    await eventOn("cron-dlq", day(1))
    const first = await sweepOnly(NOW)
    expect(first.forEvent("cron-dlq")).toHaveLength(1)

    // The message is dropped: it exhausted its retries and went to the DLQ.
    expect(await claims("cron-dlq"), "the sweep must not have claimed").toHaveLength(0)

    const second = await sweepOnly(NOW)
    expect(second.forEvent("cron-dlq"), "the next sweep must re-enqueue it").toHaveLength(1)
  })

  it("two consumers of the same message send once between them", async () => {
    // At-least-once redelivery, and the reason the claim exists: topic
    // collapsing does NOT rescue a reminder the way it rescues a score. Two
    // reminder pushes an hour apart are two cards on a lock screen at 6am.
    await eventOn("cron-dup", day(1))
    const { forEvent, env2 } = await sweepOnly(NOW)
    const job = forEvent("cron-dup")[0] as never

    await runNotificationJob(db(), env2, job)
    await runNotificationJob(db(), env2, job)

    expect((await claims("cron-dup")).filter((c) => c.kind === "24h")).toHaveLength(1)
  })

  it("the sweep skips what has already been sent, so the queue stays quiet", async () => {
    // An optimisation, not the correctness: the sweep runs every five minutes
    // and an event sits in the 24h window for a whole day, so without this it
    // would enqueue the same reminder 288 times for the consumer to discard.
    await eventOn("cron-quiet", day(1))
    await sweepAndConsume(NOW)
    const again = await sweepOnly(NOW)
    expect(
      again.forEvent("cron-quiet"),
      "an already-sent reminder must not be re-enqueued",
    ).toHaveLength(0)
  })

  it("claims once for a fan-out split across several messages", async () => {
    // A large audience is delivered across messages, each a fresh consumer
    // invocation. Claiming on every slice would claim on the first and refuse
    // every continuation — delivering only the first hundred people.
    await eventOn("cron-slices", day(1))
    const { env2 } = await sweepOnly(NOW)
    const job = { kind: "reminder", eventId: "cron-slices", window: "24h", occurredAt: "x" }

    const first = await runNotificationJob(db(), env2, { ...job, offset: 0 } as never)
    expect("why" in first ? first.why : "").not.toBe("already sent")

    // The continuation must not be refused by the claim the first slice took.
    const second = await runNotificationJob(db(), env2, { ...job, offset: 100 } as never)
    expect("why" in second ? second.why : "", "a continuation must not be blocked").not.toBe(
      "already sent",
    )
  })
})
