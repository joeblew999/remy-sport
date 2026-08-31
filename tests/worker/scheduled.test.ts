import { env } from "cloudflare:test"
import { drizzle } from "drizzle-orm/d1"
import { and, eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"
import * as schema from "../../src/db/schema"
import { sendDueReminders } from "../../src/scheduled"
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

describe("The reminder job", () => {
  beforeEach(async () => {
    await db().delete(schema.notificationSent)
  })

  it("claims a 24-hour reminder for an event starting tomorrow", async () => {
    await eventOn("cron-tomorrow", day(1))
    await sendDueReminders(env, NOW)
    expect((await claims("cron-tomorrow")).map((c) => c.kind)).toContain("24h")
  })

  it("does not claim it twice, however often the job runs", async () => {
    // The whole point. Cron is not exactly-once, so this is the ordinary case
    // rather than an edge one.
    await eventOn("cron-twice", day(1))
    await sendDueReminders(env, NOW)
    await sendDueReminders(env, NOW)
    await sendDueReminders(env, NOW)
    expect((await claims("cron-twice")).filter((c) => c.kind === "24h")).toHaveLength(1)
  })

  it("leaves an event far in the future alone", async () => {
    await eventOn("cron-far", day(30))
    await sendDueReminders(env, NOW)
    expect(await claims("cron-far")).toHaveLength(0)
  })

  it("leaves an event that has already started alone", async () => {
    // A reminder for something that began yesterday is not a reminder.
    await eventOn("cron-past", day(-1))
    await sendDueReminders(env, NOW)
    expect(await claims("cron-past")).toHaveLength(0)
  })

  it("sends the one-hour warning separately from the day-before one", async () => {
    // Two announcements about one event, not one sent twice — which is why
    // `kind` is part of the unique key.
    await eventOn("cron-both", day(1))
    await sendDueReminders(env, NOW)
    expect((await claims("cron-both")).map((c) => c.kind)).toEqual(["24h"])

    // Now stand at the day itself: the 1h window covers today.
    await sendDueReminders(env, Date.parse("2026-06-10T23:30:00Z"))
    expect((await claims("cron-both")).map((c) => c.kind).sort()).toEqual(["1h", "24h"])
  })

  it("catches up a missed run rather than skipping it", async () => {
    // The window is "within the next 24 hours", not "in exactly 24 hours", so a
    // job that did not run for six hours still sends — late, once.
    await eventOn("cron-late", day(1))
    await sendDueReminders(env, NOW + 6 * 3_600_000)
    expect((await claims("cron-late")).map((c) => c.kind)).toContain("24h")
  })
})
