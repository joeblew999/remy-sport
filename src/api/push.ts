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

import { and, eq, inArray, or } from "drizzle-orm"
import { buildPush, type PushSubscription } from "./webpush"
import * as schema from "../db/schema"
import type { Db } from "./db"
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
 * A device row's `address`: the browser's PushSubscription plus the locale it
 * was registered in.
 *
 * The locale lives on the device rather than the user on purpose — the same
 * person may read Thai on a phone and English on a laptop, and each device
 * subscribed from a browser that already knew which. There is no `user.locale`
 * column for this to disagree with.
 */
type StoredAddress = PushSubscription & { locale?: string }

export function encodeAddress(subscription: PushSubscription, locale: string): string {
  return JSON.stringify({ ...subscription, locale })
}

export function decodeAddress(address: string): StoredAddress | null {
  try {
    const parsed = JSON.parse(address) as StoredAddress
    return parsed?.endpoint && parsed?.keys?.auth && parsed?.keys?.p256dh ? parsed : null
  } catch {
    return null
  }
}

const released = new Set<string>(LOCALES)
const asLocale = (raw: string | undefined): ReleasedLocale =>
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

  const followers = await db
    .select({ userId: schema.subscription.userId })
    .from(schema.subscription)
    .where(
      // One OR'd pair per target rather than a concatenated key: SQLite has no
      // row-value IN, and joining the two columns into a string would only work
      // as long as the separator never appears in an id. A handful of targets
      // costs nothing and this cannot silently stop matching.
      or(
        ...targets.map((t) =>
          and(
            eq(schema.subscription.objectTypeCode, t.objectTypeCode),
            eq(schema.subscription.objectId, t.objectId),
          ),
        ),
      ),
    )

  const userIds = [...new Set(followers.map((f) => f.userId))].filter((id) => id !== exclude)
  if (userIds.length === 0) return []

  const [devices, optOuts] = await Promise.all([
    db
      .select({
        userId: schema.userNotificationChannel.userId,
        address: schema.userNotificationChannel.address,
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
      const parsed = decodeAddress(d.address)
      return parsed ? [{ address: d.address, subscription: parsed }] : []
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
  const bodyFor = (raw: string | undefined) => {
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
    devices.map((d) => ({ address: d.address, body: bodyFor(d.subscription.locale) })),
    args.tag,
  )
}

/**
 * Send one already-rendered notification to a list of stored addresses.
 *
 * The half that talks to push services, shared by `notify` and by the test
 * button — including the pruning of dead endpoints, which must happen wherever
 * we discover one rather than only on the path that usually does.
 */
async function deliver(
  db: Db,
  env: Bindings,
  targets: { address: string; body: PushBody }[],
  tag: string,
): Promise<{ sent: number; gone: number }> {
  const vapid = vapidFrom(env)
  if (!vapid) return { sent: 0, gone: 0 }

  const dead: string[] = []
  const results = await Promise.allSettled(
    targets.map(async (target) => {
      const subscription = decodeAddress(target.address)
      if (!subscription) return false
      const payload = await buildPush(subscription, target.body, vapid, {
        topic: tag,
        urgency: "high",
      })
      const res = await fetch(subscription.endpoint, {
        method: payload.method,
        headers: payload.headers,
        body: payload.body,
      })
      // 404/410 is the push service saying this endpoint is permanently gone —
      // uninstalled, or expired. Anything else may be transient and is left be,
      // because deleting a device on a 500 loses a reader for good.
      if (res.status === 404 || res.status === 410) dead.push(target.address)
      return res.ok
    }),
  )

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

  return {
    sent: results.filter((r) => r.status === "fulfilled" && r.value).length,
    gone: dead.length,
  }
}

/** `deliver`, for a caller that already knows exactly which addresses it means. */
export function sendToAddresses(
  db: Db,
  env: Bindings,
  addresses: string[],
  body: PushBody,
): Promise<{ sent: number; gone: number }> {
  return deliver(
    db,
    env,
    addresses.map((address) => ({ address, body })),
    body.tag,
  )
}
