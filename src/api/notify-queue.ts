/**
 * Notification fan-out, off the request path.
 *
 * `announce()` in ./games.ts was awaited inside the score mutation, and
 * `notify` → `deliver` does one `fetch` per recipient to Apple, Google or
 * Mozilla. So a coach tapping "+2" waited on N HTTP round trips — and N is
 * bounded by the Workers per-request subrequest limit. A well-followed game
 * walks into that ceiling and nothing in the code notices: the push simply
 * stops partway through the audience.
 *
 * Now `announce()` enqueues an event and returns, and this resolves the
 * audience and delivers.
 *
 * ## AT-LEAST-ONCE IS SAFE, AND HERE IS WHY
 *
 * Queues redeliver. That is fine — and it is fine for one specific reason,
 * which is load-bearing rather than incidental:
 *
 *   **Every push carries a `topic` (push service) and a `tag` (browser), and a
 *   repeated push with the same tag REPLACES the previous card rather than
 *   stacking.**
 *
 * A duplicate delivery is invisible to the reader. That property is what lets
 * this be a queue with no idempotency ledger, no "already sent" table and no
 * dedupe key. It is not a nice-to-have.
 *
 * **If anyone makes tags unique per send** — appending a timestamp, a nonce, a
 * retry counter — this design breaks *silently*: every retry becomes a second
 * notification on somebody's lock screen, and nothing here will fail. The tag
 * is built in `announce()` as `score:<gameId>` / `status:<gameId>` and must stay
 * a function of the event, never of the attempt.
 *
 * ## Why the message carries identity, not rendered text
 *
 * A queue message must be serialisable and `notify` takes a `render` closure
 * over the game row. The alternative was to render every locale at enqueue time
 * and carry the strings.
 *
 * Identity won, for three reasons.
 *
 * The row is read at consumption, so a `SCORE_UPDATE` renders the score as of
 * delivery rather than as of the tap. That is *more* correct: the reader wants
 * to know the score, not the score a few seconds ago, and topic collapsing
 * makes a slightly-late duplicate harmless.
 *
 * `MATCH_END` followed by a correction is the case worth thinking about, and it
 * lands the same way. Under this design a correction that arrives before
 * consumption produces a final card with the *corrected* score. Under the
 * alternative the reader keeps the wrong final permanently, because the next
 * `status:` push that would replace it may never come.
 *
 * And rendering at enqueue means rendering locales nobody in the audience
 * speaks — `notify` deliberately renders once per locale actually present, and
 * the audience is not known at enqueue. Doing more work at the moment we are
 * trying to do less is the wrong direction.
 *
 * The row being *gone* at consumption is the one real loss, and it is handled:
 * a deleted game sends nothing, which is correct.
 */

import { z } from "zod"
import * as schema from "../db/schema"
import { database, type Db } from "./base"

/**
 * Where a link in an email points.
 *
 * `BETTER_AUTH_URL` is this deployment's own public origin and is already
 * required for sign-in to work, so it is the one value guaranteed to be right.
 * A hash route on its own is fine in a push card, which opens inside the app,
 * and useless in an email, which is read outside it.
 */
const originOf = (env: Bindings) => (env.BETTER_AUTH_URL ?? "").replace(/\/+$/, "")
import { notify } from "./push"
import { track } from "../analytics"
import type { Bindings } from "../types"
import { pick, type Names } from "../domain/names"
import { m } from "../paraglide/messages.js"
import type { ReleasedLocale } from "../domain/vocabularies"

/**
 * One fan-out to perform.
 *
 * Validated rather than trusted: a message is input, it survives a deploy, and
 * a shape from an older version of this Worker can arrive after a new one is
 * live. A malformed one is acked and reported rather than retried forever —
 * see `handleNotification`.
 */
/**
 * How many recipients this slice starts after.
 *
 * Chunking is by offset rather than by carrying the remaining addresses,
 * because a push endpoint is a device identifier and a queue is not somewhere
 * to put a list of them.
 */
const offset = z.number().int().min(0).default(0)

/** Something happened to a game: a tip-off, a score, a final whistle. */
const GameJob = z.object({
  kind: z.literal("game"),
  typeCode: z.enum(["MATCH_START", "MATCH_END", "SCORE_UPDATE"]),
  gameId: z.string().min(1),
  /** Excluded from the audience: nobody needs telling about their own tap. */
  actorId: z.string().min(1),
  /** When the event happened, for telemetry. Not used for rendering. */
  occurredAt: z.string(),
  offset,
})

/**
 * An event starts soon.
 *
 * A first-class kind rather than a game job wearing a costume. Both kinds
 * resolve an audience and fan out, which is why they share a consumer — only
 * the read and the render differ, and those are the two things a discriminated
 * union makes explicit.
 */
const ReminderJob = z.object({
  kind: z.literal("reminder"),
  eventId: z.string().min(1),
  /** Which of the two windows the Product Owner's description names. */
  window: z.enum(["24h", "1h"]),
  occurredAt: z.string(),
  offset,
})

export const NotificationJob = z.discriminatedUnion("kind", [GameJob, ReminderJob])
export type NotificationJob = z.infer<typeof NotificationJob>
export type GameJob = z.infer<typeof GameJob>
export type ReminderJob = z.infer<typeof ReminderJob>

/**
 * Recipients per message.
 *
 * The Workers subrequest limit is the thing being defended against, and one
 * `fetch` goes out per recipient. Comfortably under it, so a slice can also
 * afford the D1 reads and the re-enqueue.
 */
export const CHUNK = 100

/** What one message did, so the caller can decide and the tests can assert. */
export type JobOutcome =
  | { done: true; sent: number; gone: number; remaining: number }
  /** Nothing to do — a deleted game, or an audience already exhausted. */
  | { done: true; sent: 0; gone: 0; remaining: 0; why: string }

/**
 * Perform one slice of one fan-out.
 *
 * A plain function taking what it needs, so it runs under vitest-pool-workers
 * with no queue runtime: the tests drive this directly and the `queue` handler
 * in src/index.ts is a thin shell around it.
 *
 * Re-enqueues the remainder itself when there is one. That keeps "how big is a
 * slice" in one place, next to the reason it exists.
 */
export async function runNotificationJob(
  db: Db,
  env: Bindings,
  job: NotificationJob,
): Promise<JobOutcome> {
  return job.kind === "reminder"
    ? runReminderJob(db, env, job)
    : runGameJob(db, env, job)
}

async function runGameJob(db: Db, env: Bindings, job: GameJob): Promise<JobOutcome> {
  const row = await db.query.game.findFirst({
    where: (g, { eq }) => eq(g.id, job.gameId),
    with: {
      homeTeam: { columns: { names: true } },
      awayTeam: { columns: { names: true } },
      event: { columns: { id: true, names: true } },
    },
  })
  // Deleted between the tap and the delivery. Nothing to say, and retrying will
  // not bring it back — so this is a success, not a failure.
  if (!row) return { done: true, sent: 0, gone: 0, remaining: 0, why: "game is gone" }

  const game = row as typeof row & {
    homeTeam?: { names: Names } | null
    awayTeam?: { names: Names } | null
    event?: { id: string; names: Names } | null
  }
  const args = {
    homeScore: String(game.homeScore ?? 0),
    awayScore: String(game.awayScore ?? 0),
  }

  const result = await notify(db, env, {
    typeCode: job.typeCode,
    targets: [
      { objectTypeCode: "GAME", objectId: job.gameId },
      ...(game.eventId ? [{ objectTypeCode: "EVENT" as const, objectId: game.eventId }] : []),
      ...(game.homeTeamId ? [{ objectTypeCode: "TEAM" as const, objectId: game.homeTeamId }] : []),
      ...(game.awayTeamId ? [{ objectTypeCode: "TEAM" as const, objectId: game.awayTeamId }] : []),
    ],
    // A function of the event, never of the attempt — see the note at the top
    // of this file. This is what makes redelivery invisible.
    tag: `${job.typeCode === "SCORE_UPDATE" ? "score" : "status"}:${job.gameId}`,
    exclude: job.actorId,
    offset: job.offset,
    limit: CHUNK,
    source: "queue:game",
    /**
     * One renderer per channel, written separately on purpose.
     *
     * A push title has to be readable on a lock screen, so it is the score and
     * nothing else. An email is read in a list of other email, so it says what
     * it is about, carries a link, and tells the reader why they got it — which
     * a push card has no room for and does not need, because the reader chose
     * to install the app.
     *
     * Sending the push body as an email body would have been one line and
     * wrong: "Live at Bangkok Schools League" is a fine second line under a
     * score and a terrible email.
     */
    render: {
      PUSH: (locale: ReleasedLocale) => {
        const home = pick(game.homeTeam?.names, locale)
        const away = pick(game.awayTeam?.names, locale)
        const event = pick(game.event?.names, locale)
        const url = `#/games/${job.gameId}`
        const tag = `${job.typeCode === "SCORE_UPDATE" ? "score" : "status"}:${job.gameId}`
        if (job.typeCode === "MATCH_START") {
          return {
            channel: "PUSH" as const,
            title: m.push_match_start_title({ home, away }, { locale }),
            body: m.push_match_start_body({ event }, { locale }),
            url,
            tag,
          }
        }
        if (job.typeCode === "MATCH_END") {
          return {
            channel: "PUSH" as const,
            title: m.push_match_end_title({ home, away, ...args }, { locale }),
            body: m.push_match_end_body({ event }, { locale }),
            url,
            tag,
          }
        }
        return {
          channel: "PUSH" as const,
          title: m.push_score_title({ home, away, ...args }, { locale }),
          body: m.push_score_body({ event }, { locale }),
          url,
          tag,
        }
      },
      EMAIL: (locale: ReleasedLocale) => {
        const home = pick(game.homeTeam?.names, locale)
        const away = pick(game.awayTeam?.names, locale)
        const event = pick(game.event?.names, locale)
        // Absolute: an email is read outside the app, so a hash route on its
        // own goes nowhere.
        const url = `${originOf(env)}/#/games/${job.gameId}`
        const subject =
          job.typeCode === "MATCH_START"
            ? m.email_game_start_subject({ home, away }, { locale })
            : job.typeCode === "MATCH_END"
              ? m.email_game_end_subject({ home, away, ...args }, { locale })
              : m.email_game_subject({ home, away, ...args }, { locale })
        return {
          channel: "EMAIL" as const,
          subject,
          text: m.email_game_text({ event, home, away, url, ...args }, { locale }),
        }
      },
    },
  })

  /**
   * The remainder, as its own message.
   *
   * Re-enqueued rather than looped, so one message can never approach the
   * subrequest limit however popular a team becomes — which is the whole reason
   * this is a queue and not a `waitUntil`.
   */
  if (result.remaining > 0 && env.NOTIFICATIONS) {
    await env.NOTIFICATIONS.send({ ...job, offset: job.offset + CHUNK })
  }

  return { done: true, sent: result.sent, gone: result.gone, remaining: result.remaining }
}

/**
 * An event starting soon.
 *
 * ## THE CLAIM LIVES HERE, AND MOVING IT LOSES REMINDERS
 *
 * `notification_sent` is claimed **at consumption**, not when the sweep
 * enqueues. That choice is the difference between a reminder that is late and
 * a reminder that never arrives, and it is not obvious from either side:
 *
 * Claiming in the sweep would mean the sweep records "sent" for something that
 * has not been sent yet. A message that then exhausts its retries and lands in
 * the dead letter queue is a reminder **lost for good** — the claim row says
 * done, so no later sweep will try again, and the only trace is a DLQ entry.
 * A lost reminder is silence, and silence is what this whole design is trying
 * not to have.
 *
 * Claiming here inverts that. A message that dies never writes a claim, so the
 * next sweep — five minutes later, inside the same window — enqueues it again
 * and it is recovered. The cost is that the sweep can enqueue a reminder more
 * than once; the claim below is what makes that at most one *send*, because
 * `onConflictDoNothing` plus a changed-row count is one atomic statement.
 *
 * **Topic collapsing does not rescue this**, the way it rescues score updates.
 * Two score pushes an hour apart replace each other; two reminder pushes an
 * hour apart are two cards on somebody's lock screen at 6am. The claim is doing
 * real work here that the tag cannot do.
 *
 * The sweep also *reads* this table to skip reminders already sent. That is an
 * optimisation and nothing more — it reduces queue traffic and is allowed to be
 * stale. The correctness is entirely in the claim below.
 */
async function runReminderJob(db: Db, env: Bindings, job: ReminderJob): Promise<JobOutcome> {
  const event = await db.query.event.findFirst({
    where: (e, { eq }) => eq(e.id, job.eventId),
    columns: { id: true, names: true },
  })
  if (!event) return { done: true, sent: 0, gone: 0, remaining: 0, why: "event is gone" }

  /**
   * Claimed once, on the first slice only.
   *
   * A large audience is delivered across several messages, and each is a fresh
   * consumer invocation — so claiming on every slice would claim once, then
   * refuse every continuation and deliver only the first hundred people.
   */
  if (job.offset === 0 && !(await claimReminder(db, job.eventId, job.window))) {
    return { done: true, sent: 0, gone: 0, remaining: 0, why: "already sent" }
  }

  const result = await notify(db, env, {
    typeCode: "EVENT_REMINDER",
    targets: [{ objectTypeCode: "EVENT", objectId: job.eventId }],
    // One key per event and window, so a redelivery that got past the claim
    // still replaces rather than stacks.
    tag: `reminder:${job.eventId}:${job.window}`,
    offset: job.offset,
    limit: CHUNK,
    source: "queue:reminder",
    render: {
      PUSH: (locale: ReleasedLocale) => ({
        channel: "PUSH" as const,
        title: m.push_event_reminder_title(
          { event: pick(event.names as Names, locale) },
          { locale },
        ),
        body: m.push_event_reminder_body({}, { locale }),
        url: `#/event/${job.eventId}`,
        tag: `reminder:${job.eventId}:${job.window}`,
      }),
      EMAIL: (locale: ReleasedLocale) => {
        const name = pick(event.names as Names, locale)
        return {
          channel: "EMAIL" as const,
          subject: m.email_reminder_subject({ event: name }, { locale }),
          text: m.email_reminder_text(
            { event: name, url: `${originOf(env)}/#/event/${job.eventId}` },
            { locale },
          ),
        }
      },
    },
  })

  if (result.remaining > 0 && env.NOTIFICATIONS) {
    await env.NOTIFICATIONS.send({ ...job, offset: job.offset + CHUNK })
  }
  return { done: true, sent: result.sent, gone: result.gone, remaining: result.remaining }
}

/**
 * Claim the right to send, or discover somebody already has.
 *
 * `onConflictDoNothing` plus a changed-row count: one statement, therefore
 * atomic. The obvious alternative — read, then write if absent — has two
 * concurrent consumers both read nothing and both send.
 */
export async function claimReminder(db: Db, eventId: string, window: string): Promise<boolean> {
  const res = await db
    .insert(schema.notificationSent)
    .values({
      objectTypeCode: "EVENT",
      objectId: eventId,
      typeCode: "EVENT_REMINDER",
      kind: window,
      sentAt: new Date().toISOString(),
    })
    .onConflictDoNothing()
  return res.meta.changes > 0
}

/**
 * One message, and what to tell the queue about it.
 *
 * `notify` swallows its own failures so it cannot fail the write it follows.
 * Inside a consumer that would be exactly wrong: swallowing tells the queue the
 * message succeeded, and a transient D1 outage would silently drop every
 * notification during it. So the decision is made explicitly here.
 *
 *   **ack** — the work is finished, or repeating it cannot help. A malformed
 *             message (retrying a bad shape three times then dead-lettering it
 *             is three wasted attempts and a delayed diagnosis), a deleted
 *             game, and a delivered slice. Individual push failures are already
 *             counted inside `deliver` and must NOT fail the message: one dead
 *             endpoint out of a hundred would otherwise re-deliver to the other
 *             ninety-nine.
 *   **retry** — the failure is infrastructural and might not repeat: the D1
 *             read threw, or the re-enqueue did. Redelivery is safe (see the
 *             tag note above), so retrying costs nothing but a duplicate card
 *             the reader never sees.
 */
/** What to call this job in telemetry: the notification type it will send. */
const jobLabel = (job: NotificationJob): string =>
  job.kind === "reminder" ? "EVENT_REMINDER" : job.typeCode

export async function handleNotification(
  env: Bindings,
  body: unknown,
): Promise<{ action: "ack" | "retry"; why: string }> {
  /**
   * A message with no `kind` is a game job from before the union existed.
   *
   * Costs one line and covers the deploy window, where a message enqueued by
   * the previous version is consumed by the next one. Without it those become
   * "malformed", get acked, and the notification is dropped silently — which is
   * the failure this whole path is built to avoid.
   */
  const shaped =
    body !== null && typeof body === "object" && !("kind" in body)
      ? { ...(body as Record<string, unknown>), kind: "game" }
      : body

  const parsed = NotificationJob.safeParse(shaped)
  if (!parsed.success) {
    // Reported, not retried. A shape that is wrong now is wrong in a minute.
    track(env, "notify.dead", { reason: "malformed", typeCode: "" })
    return { action: "ack", why: "malformed message" }
  }

  try {
    const outcome = await runNotificationJob(database(env), env, parsed.data)
    return { action: "ack", why: "why" in outcome ? outcome.why : `sent ${outcome.sent}` }
  } catch (error) {
    // Infrastructural. Let the queue try again; after max_retries it lands in
    // the DLQ, whose consumer makes it visible.
    track(env, "notify.dead", {
      reason: error instanceof Error ? error.name : "unknown",
      typeCode: jobLabel(parsed.data),
    })
    return { action: "retry", why: error instanceof Error ? error.message : "unknown" }
  }
}
