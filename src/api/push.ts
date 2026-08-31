/**
 * Web Push: who should hear about a change, and how it reaches their phone.
 *
 * No table was added for any of this. The PO's model already had the three
 * pieces and they compose exactly:
 *
 *   `subscription`               who follows which object (EVENT / TEAM / GAME)
 *   `userNotificationChannel`    one row per device — PUSH endpoint in `address`
 *   `userNotificationPreference` which NOTIFICATION_TYPE, on which channel
 *
 * So "notify everyone following this game" is a join, not a feature.
 *
 * **Following an object is the opt-in.** A preference row is how a reader turns
 * one type off; no row means on. The alternative — send nothing until a
 * preference exists — means a reader who followed a team, granted the browser
 * permission and registered a device still gets silence, with no way to tell
 * whether it is broken. Consent was already given three times by then.
 *
 * Text is translated *here*, not in the service worker. That worker runs with
 * no page open: no locale context, no store, no React. It receives finished
 * strings in the language its device subscribed in.
 */

import { and, eq, inArray } from "drizzle-orm"
import { track } from "../analytics"
import { buildPush, type PushSubscription } from "./webpush"
import * as schema from "../db/schema"
import type { Db } from "./db"
import { audienceFor } from "./relations"
import type { Bindings } from "../types"
import { LOCALES, type ReleasedLocale } from "../domain/vocabularies"
import { FALLBACK } from "../domain/names"
import type { NotificationTypeCode, ObjectTypeCode } from "../domain/vocabularies"

/** Exactly what src/web/sw.ts reads out of `event.data`. */
export type PushBody = {
  title: string
  body: string
  url: string
  tag: string
}

/** One object a reader may follow, as stored in `subscription`. */
export type Target = { objectTypeCode: ObjectTypeCode; objectId: string }

/**
 * The action that decides who hears about each kind of object.
 *
 * A GAME has no RECEIVE action of its own in the model — a game is notified
 * about through its teams and its event, which is what `announce` passes — so
 * a direct follow of a game reaches nobody through this map. That is the
 * model's shape, not an omission here.
 */
export const RECEIVE_ACTION: Partial<Record<ObjectTypeCode, string>> = {
  TEAM: "RECEIVE_TEAM_NOTIFICATIONS",
  EVENT: "RECEIVE_EVENT_NOTIFICATIONS",
  PLAYER: "RECEIVE_PLAYER_NOTIFICATIONS",
}

/**
 * One registered browser, read back off its row.
 *
 * `address` is the endpoint, `secret` the two keys the payload is encrypted to,
 * and `localeCode` the language that device asked for. Three columns, because
 * the endpoint is the row's identity and an identity has to be queryable — the
 * first version packed all of it into `address` as JSON, which meant finding a
 * browser was a table read and a scan in JavaScript.
 *
 * The locale is per device rather than per person on purpose: the same reader
 * has a phone in Thai and a laptop in English, and each told us which when it
 * registered.
 */
type Device = { subscription: PushSubscription; locale: string | null }

/** Null when the row is not usable — a PUSH row with no keys cannot be sent to. */
export function toDevice(row: {
  address: string
  secret: string | null
  localeCode: string | null
}): Device | null {
  if (!row.secret) return null
  try {
    const keys = JSON.parse(row.secret) as { p256dh?: string; auth?: string }
    if (!keys.p256dh || !keys.auth) return null
    return {
      subscription: {
        endpoint: row.address,
        expirationTime: null,
        keys: { p256dh: keys.p256dh, auth: keys.auth },
      },
      locale: row.localeCode,
    }
  } catch {
    return null
  }
}

const released = new Set<string>(LOCALES)
const asLocale = (raw: string | null): ReleasedLocale =>
  raw && released.has(raw) ? (raw as ReleasedLocale) : (FALLBACK as ReleasedLocale)

/**
 * The three secrets, or null.
 *
 * Push is optional infrastructure: a deployment with no keys serves the whole
 * app and simply never sends. Every caller checks rather than throwing — a
 * missing key must not turn entering a score into a 500.
 */
export function vapidFrom(env: Bindings) {
  const { VAPID_SUBJECT: subject, VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey } = env
  return subject && publicKey && privateKey ? { subject, publicKey, privateKey } : null
}

/**
 * Everyone following any of `targets`, with an enabled PUSH device and no
 * opt-out for `typeCode` — one row per device, because a person may carry two.
 */
async function audience(
  db: Db,
  typeCode: NotificationTypeCode,
  targets: Target[],
  exclude?: string,
) {
  if (targets.length === 0) return []

  // Who should hear about this is the model's answer, not a table read.
  //
  // This used to select from `subscription` — everyone who had pressed Follow —
  // which quietly disagreed with the PO on who a team's notifications are for.
  // `RECEIVE_TEAM_NOTIFICATIONS` is granted to HEAD_COACH, ASSISTANT_COACH,
  // TEAM_MANAGER and TEAM_PLAYER as well as FOLLOWER_TEAM, and
  // `RECEIVE_EVENT_NOTIFICATIONS` to OWNER and CO_ORGANIZER. So a team's own
  // coach was told nothing about their own game until they pressed a button,
  // and the model had said otherwise since before this feature existed.
  const reached = await Promise.all(
    targets.map((t) => audienceFor(db, RECEIVE_ACTION[t.objectTypeCode] ?? "", t.objectId)),
  )

  const userIds = [...new Set(reached.flat())].filter((id) => id !== exclude)
  if (userIds.length === 0) return []

  const [devices, optOuts] = await Promise.all([
    db
      .select({
        userId: schema.userNotificationChannel.userId,
        address: schema.userNotificationChannel.address,
        secret: schema.userNotificationChannel.secret,
        localeCode: schema.userNotificationChannel.localeCode,
      })
      .from(schema.userNotificationChannel)
      .where(
        and(
          inArray(schema.userNotificationChannel.userId, userIds),
          eq(schema.userNotificationChannel.channelCode, "PUSH"),
          eq(schema.userNotificationChannel.isEnabled, true),
        ),
      ),
    db
      .select({ userId: schema.userNotificationPreference.userId })
      .from(schema.userNotificationPreference)
      .where(
        and(
          inArray(schema.userNotificationPreference.userId, userIds),
          eq(schema.userNotificationPreference.notificationTypeCode, typeCode),
          eq(schema.userNotificationPreference.channelCode, "PUSH"),
          eq(schema.userNotificationPreference.isEnabled, false),
        ),
      ),
  ])

  const silenced = new Set(optOuts.map((o) => o.userId))
  return devices
    .filter((d) => !silenced.has(d.userId))
    .flatMap((d) => {
      const device = toDevice(d)
      return device ? [{ address: d.address, ...device }] : []
    })
}

/**
 * Send one notification to everyone following `targets`.
 *
 * Returns how many devices took it, so a caller can log and a test can assert.
 * Never throws: a push service being down, or a deployment having no keys, must
 * not fail the write that triggered it.
 */
export async function notify(
  db: Db,
  env: Bindings,
  args: {
    typeCode: NotificationTypeCode
    targets: Target[]
    /** Called once per locale actually present in the audience. */
    render: (locale: ReleasedLocale) => Omit<PushBody, "tag">
    /**
     * Collapse key. A second SCORE_UPDATE for the same game replaces the first
     * instead of stacking, so a close game does not leave forty cards to
     * dismiss. Sent as the push service's `topic` and as the browser's `tag`.
     */
    tag: string
    /** The actor. Nobody needs telling about the thing they just did. */
    exclude?: string
  },
): Promise<{ sent: number; gone: number }> {
  const vapid = vapidFrom(env)
  if (!vapid) return { sent: 0, gone: 0 }

  const devices = await audience(db, args.typeCode, args.targets, args.exclude)
  if (devices.length === 0) return { sent: 0, gone: 0 }

  // Rendered once per locale, not once per device: an arena full of followers
  // is still at most three strings.
  const rendered = new Map<ReleasedLocale, PushBody>()
  const bodyFor = (raw: string | null) => {
    const locale = asLocale(raw)
    const hit = rendered.get(locale)
    if (hit) return hit
    const made = { ...args.render(locale), tag: args.tag }
    rendered.set(locale, made)
    return made
  }

  return deliver(
    db,
    env,
    devices.map((d) => ({
      address: d.address,
      subscription: d.subscription,
      body: bodyFor(d.locale),
    })),
    args.tag,
    args.typeCode,
  )
}

/**
 * Send one already-rendered notification to a list of stored addresses.
 *
 * The half that talks to push services, shared by `notify` and by the test
 * button — including the pruning of dead endpoints, which must happen wherever
 * we discover one rather than only on the path that usually does.
 */
/**
 * Which push service, coarsely, from the hostname and nothing else.
 *
 * **The endpoint is a device identifier and is never recorded.** Its path is
 * the secret — anyone holding the full URL can push to that browser — so only
 * the hostname is read, and only to decide which of four buckets it is. The
 * hostname is shared by every subscriber of that vendor and identifies nobody.
 *
 * Coarse on purpose. FCM has answered on more than one host over the years and
 * Mozilla's includes a region, so recording the raw host would drift into
 * higher cardinality for no gain: the question is "is Apple failing", not
 * "which of Apple's front-ends".
 */
export function pushService(endpoint: string): string {
  let host: string
  try {
    host = new URL(endpoint).hostname
  } catch {
    return "other"
  }
  if (host.endsWith(".push.apple.com")) return "apple"
  if (host.endsWith(".googleapis.com")) return "fcm"
  if (host.endsWith(".mozilla.com")) return "mozilla"
  if (host.endsWith(".windows.com") || host.endsWith(".notify.windows.com")) return "windows"
  return "other"
}

/** What became of one attempt. `gone` is permanent; `failed` may not be. */
type Outcome = "sent" | "gone" | "failed"

async function deliver(
  db: Db,
  env: Bindings,
  targets: { address: string; subscription: PushSubscription; body: PushBody }[],
  tag: string,
  /**
   * The notification type, for telemetry only. Absent for the test button,
   * which has no NotificationTypeCode — recorded as "test" rather than blank so
   * a row with no type is obviously the test path and not a dropped field.
   */
  typeCode?: NotificationTypeCode,
): Promise<{ sent: number; gone: number }> {
  const vapid = vapidFrom(env)
  if (!vapid) return { sent: 0, gone: 0 }

  const dead: string[] = []
  const results = await Promise.allSettled(
    targets.map(async ({ address, subscription, body }) => {
      const payload = await buildPush(subscription, body, vapid, {
        topic: tag,
        urgency: "high",
      })
      const res = await fetch(subscription.endpoint, {
        method: payload.method,
        headers: payload.headers,
        body: payload.body,
      })
      /**
       * Per attempt, keyed by the push service's host.
       *
       * The failure this exists to catch is vendor-shaped: Apple, FCM and
       * Mozilla each enforce the RFCs differently, and the way this breaks is
       * that one of them starts rejecting everything while the others carry on.
       * A single `sent` count averages that away into "mostly fine". The host
       * is the whole point of the row — without it there is nothing to notice.
       */
      track(env, "push.sent", {
        host: new URL(subscription.endpoint).host,
        status: String(res.status),
        tag,
        ok: res.ok ? 1 : 0,
      })
      // 404/410 is the push service saying this endpoint is permanently gone —
      // uninstalled, or expired. Anything else may be transient and is left be,
      // because deleting a device on a 500 loses a reader for good.
      if (res.status === 404 || res.status === 410) {
        dead.push(address)
        return "gone" as Outcome
      }
      return (res.ok ? "sent" : "failed") as Outcome
    }),
  )

  /**
   * One row per service in this batch, not one per batch.
   *
   * A batch is usually one vendor and this is usually one row. When it is
   * mixed, a single label would have to be a lie or a blank, and the whole
   * reason the label exists is to separate "Apple is failing" from "everything
   * is failing" — which one row per batch cannot express. Bounded at four.
   *
   * `allSettled` preserves order, so results[i] is targets[i]: that is what
   * lets a *rejected* promise still be attributed to a service. Those are the
   * sends `push.sent` never sees, because it is written after `fetch` returns.
   */
  const perService = new Map<string, { sent: number; gone: number; failed: number }>()
  results.forEach((result, i) => {
    const service = pushService(targets[i]!.subscription.endpoint)
    const row = perService.get(service) ?? { sent: 0, gone: 0, failed: 0 }
    // A rejected promise is a network failure — DNS, refused, timed out. Not a
    // dead subscription, and the distinction is the point of the row.
    row[result.status === "fulfilled" ? result.value : "failed"] += 1
    perService.set(service, row)
  })
  for (const [service, counts] of perService) {
    // Synchronous, swallows its own errors, and writes at most four points —
    // see `write` in src/analytics.ts. It cannot throw into the send path and
    // adds no latency. A no-op when ANALYTICS is unbound.
    track(env, "push.batch", { type: typeCode ?? "test", service, ...counts })
  }

  if (dead.length > 0) {
    await db
      .delete(schema.userNotificationChannel)
      .where(
        and(
          eq(schema.userNotificationChannel.channelCode, "PUSH"),
          inArray(schema.userNotificationChannel.address, dead),
        ),
      )
  }

  // Unchanged for callers: the shape and the meaning are what they were, and
  // the announce paths are untouched.
  return {
    sent: results.filter((r) => r.status === "fulfilled" && r.value === "sent").length,
    gone: dead.length,
  }
}

/**
 * `deliver`, for a caller that already knows which rows it means — the test
 * button, which deliberately bypasses following and mutes.
 *
 * Rows that cannot be sent to (a PUSH row with no keys) are dropped here rather
 * than counted as failures: they are not a delivery problem, they are a row
 * that predates the keys having a column of their own.
 */
export function sendToRows(
  db: Db,
  env: Bindings,
  rows: { address: string; secret: string | null; localeCode: string | null }[],
  body: PushBody,
): Promise<{ sent: number; gone: number }> {
  const targets = rows.flatMap((row) => {
    const device = toDevice(row)
    return device ? [{ address: row.address, subscription: device.subscription, body }] : []
  })
  return deliver(db, env, targets, body.tag)
}
