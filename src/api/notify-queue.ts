/**
 * Notification fan-out, off the request path.
 *
 * `announce()` was awaited inside the score mutation, and `notify` does one
 * fetch per recipient — so a coach tapping "+2" waited on N round trips, and N
 * is bounded by the Workers subrequest limit. A well-followed game walks into
 * that ceiling and the push stops partway through the audience, silently.
 *
 * ## At-least-once is safe, and here is why
 *
 * Queues redeliver, which is fine for one load-bearing reason: **every push
 * carries a `tag`, and a repeat with the same tag replaces the previous card
 * rather than stacking.** That is what lets this run with no idempotency
 * ledger and no dedupe key.
 *
 * **If anyone makes tags unique per send** — a timestamp, a nonce, a retry
 * counter — this breaks *silently*: every retry becomes a second notification
 * on somebody's lock screen and nothing here will fail. The tag is built in
 * `announce()` as `score:<gameId>` and must stay a function of the event,
 * never of the attempt.
 *
 * ## The message carries identity, not rendered text
 *
 * The row is read at consumption, so a score renders as of delivery rather
 * than as of the tap — and a correction arriving first produces a final card
 * with the corrected score, where carrying rendered text would leave the wrong
 * final permanently.
 *
 * Rendering at enqueue would also render locales nobody in the audience
 * speaks, since the audience is not known then.
 *
 * A row gone at consumption is the one real loss, and it is correct: a deleted
 * game sends nothing.
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
import { gameMail } from "../mail/templates/game"
import { reminderMail } from "../mail/templates/reminder"

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
 * A plain function taking what it needs, so it runs under the Workers Vitest plugin
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
        const url = `#/game/${job.gameId}`
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
        // own goes nowhere. The words and the layout are the template's.
        const url = `${originOf(env)}/#/game/${job.gameId}`
        const kind = job.typeCode === "MATCH_START" ? "start" : job.typeCode === "MATCH_END" ? "end" : "score"
        return {
          channel: "EMAIL" as const,
          ...gameMail({ kind, home, away, event, url, ...args }, locale),
          unsubscribeLabel: m.email_unsubscribe({}, { locale }),
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
 * ## The claim lives here, and moving it loses reminders
 *
 * `notification_sent` is claimed **at consumption**, not when the sweep
 * enqueues. Claiming in the sweep would record "sent" before it was, so a
 * message that exhausted its retries would be lost for good — the claim says
 * done and no later sweep retries it.
 *
 * Claiming here inverts that: a message that dies writes no claim, so the next
 * sweep enqueues it again. The cost is that the sweep may enqueue twice, and
 * the claim below makes that at most one *send* — `onConflictDoNothing` plus a
 * changed-row count is one atomic statement.
 *
 * **Topic collapsing does not rescue this** the way it rescues score updates:
 * two reminder pushes an hour apart are two cards at 6am.
 *
 * The sweep also reads this table to skip sent reminders. That is an
 * optimisation, allowed to be stale; correctness is entirely in the claim.
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
          ...reminderMail({ event: name, url: `${originOf(env)}/#/event/${job.eventId}` }, locale),
          unsubscribeLabel: m.email_unsubscribe({}, { locale }),
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

/** What to call this job in telemetry: the notification type it will send. */
const jobLabel = (job: NotificationJob): string =>
  job.kind === "reminder" ? "EVENT_REMINDER" : job.typeCode

/**
 * One message, and what to tell the queue about it.
 *
 * `notify` swallows its own failures so it cannot fail the write it follows.
 * In a consumer that is exactly wrong — swallowing tells the queue the message
 * succeeded — so the decision is made explicitly here.
 *
 *   **ack** — finished, or repeating cannot help: a malformed message, a
 *             deleted game, a delivered slice. Individual push failures are
 *             counted inside `deliver` and must NOT fail the message, or one
 *             dead endpoint re-delivers to the other ninety-nine.
 *   **retry** — infrastructural and might not repeat: the D1 read threw, or the
 *             re-enqueue did. Redelivery is safe, so it costs only a duplicate
 *             card the reader never sees.
 */
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
