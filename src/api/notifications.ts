/**
 * The reader's side of notifications: what they follow, which devices they
 * carry, and what they would rather not hear about.
 *
 * Three separate ideas, deliberately not collapsed into one "notifications on"
 * switch:
 *
 *   follow      — I care about this team / event / game        (`subscription`)
 *   device      — this browser may be reached                  (`userNotificationChannel`)
 *   preference  — but not for this kind of thing               (`userNotificationPreference`)
 *
 * They fail independently and a reader can fix each one. A single switch cannot
 * express "notify me about my daughter's team but not every score in the
 * tournament", which is the actual thing people want.
 *
 * Sending lives in ./push.ts.
 */

import { and, eq } from "drizzle-orm"
import { ORPCError } from "@orpc/server"
import { z } from "zod"
import * as schema from "../db/schema"
import { authed, authedRoute, pub } from "./base"
import { encodeAddress, sendToAddresses, vapidFrom } from "./push"
import {
  LOCALES,
  NOTIFICATION_TYPE_CODES,
  OBJECT_TYPE_CODES,
  type NotificationTypeCode,
} from "../domain/vocabularies"
import { objectExists, tableForObjectType } from "./relations"
import { m } from "../paraglide/messages.js"

/** What the browser's `PushSubscription.toJSON()` gives us. */
const SubscriptionInput = z.object({
  endpoint: z.string().url(),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
})

const ObjectRef = z.object({
  objectTypeCode: z.enum(OBJECT_TYPE_CODES),
  objectId: z.string().min(1),
})

/**
 * The VAPID public key, so a browser can subscribe.
 *
 * Public on purpose: it is the key the browser pins into the subscription and
 * is not a secret in any sense — every push service sees it. Served rather than
 * baked into the bundle so one build works against dev, tunnel and production
 * with different keys, and so a deployment with push switched off answers
 * `null` and the UI can say so instead of failing at subscribe() time.
 */
export const key = pub
  .route({ method: "GET", path: "/push/key", summary: "The VAPID public key, or null if push is off" })
  .output(z.object({ publicKey: z.string().nullable() }))
  .handler(({ context }) => ({ publicKey: vapidFrom(context.env)?.publicKey ?? null }))

/**
 * Register this browser as a place notifications can reach.
 *
 * Keyed on the endpoint, not on a device id we invent: the endpoint *is* the
 * browser's identity for push, it is what the push service routes on, and
 * re-subscribing on the same browser returns the same one. Upserting on it
 * means signing in twice on one phone leaves one row, not two, and so the
 * reader is not notified twice.
 */
export const subscribe = authed
  .route({ method: "POST", path: "/push/subscribe", summary: "Register this browser for push", ...authedRoute })
  .input(
    z.object({
      subscription: SubscriptionInput,
      /** How the reader will recognise it in a list. "iPhone", "Chrome on Mac". */
      label: z.string().min(1).max(60),
      /** Which language to send *this device* in. See push.ts on why per-device. */
      locale: z.enum(LOCALES).optional(),
    }),
  )
  .output(z.object({ ok: z.literal(true) }))
  .handler(async ({ context, input }) => {
    const address = encodeAddress(
      {
        endpoint: input.subscription.endpoint,
        expirationTime: input.subscription.expirationTime ?? null,
        keys: input.subscription.keys,
      },
      input.locale ?? LOCALES[0],
    )

    // Same browser, new session: replace whatever was stored for this endpoint
    // rather than adding a row. Deleting by endpoint prefix is not possible, so
    // the address is matched whole — which works because the endpoint is inside
    // it and the rest is derived from the same subscribe() call.
    const mine = await context.db
      .select({ address: schema.userNotificationChannel.address })
      .from(schema.userNotificationChannel)
      .where(
        and(
          eq(schema.userNotificationChannel.userId, context.user.id),
          eq(schema.userNotificationChannel.channelCode, "PUSH"),
        ),
      )
    const existing = mine.find((row) => row.address.includes(input.subscription.endpoint))

    if (existing) {
      await context.db
        .update(schema.userNotificationChannel)
        .set({ address, addressLabel: input.label, isEnabled: true })
        .where(
          and(
            eq(schema.userNotificationChannel.userId, context.user.id),
            eq(schema.userNotificationChannel.channelCode, "PUSH"),
            eq(schema.userNotificationChannel.address, existing.address),
          ),
        )
    } else {
      await context.db.insert(schema.userNotificationChannel).values({
        userId: context.user.id,
        channelCode: "PUSH",
        address,
        addressLabel: input.label,
        isEnabled: true,
        // Nothing to verify: the browser handed us the endpoint directly and a
        // push either reaches it or 410s. Unlike email or SMS there is no
        // address a reader could mistype into someone else's inbox.
        verifiedAt: new Date().toISOString(),
      })
    }
    return { ok: true as const }
  })

/** Forget this browser. Called when a reader turns notifications off. */
export const unsubscribe = authed
  .route({ method: "POST", path: "/push/unsubscribe", summary: "Stop pushing to this browser", ...authedRoute })
  .input(z.object({ endpoint: z.string().url() }))
  .output(z.object({ removed: z.number() }))
  .handler(async ({ context, input }) => {
    const mine = await context.db
      .select({ address: schema.userNotificationChannel.address })
      .from(schema.userNotificationChannel)
      .where(
        and(
          eq(schema.userNotificationChannel.userId, context.user.id),
          eq(schema.userNotificationChannel.channelCode, "PUSH"),
        ),
      )
    const hit = mine.filter((row) => row.address.includes(input.endpoint))
    for (const row of hit) {
      await context.db
        .delete(schema.userNotificationChannel)
        .where(
          and(
            eq(schema.userNotificationChannel.userId, context.user.id),
            eq(schema.userNotificationChannel.channelCode, "PUSH"),
            eq(schema.userNotificationChannel.address, row.address),
          ),
        )
    }
    return { removed: hit.length }
  })

/** The devices this reader has registered, for a list they can prune. */
export const devices = authed
  .route({ method: "GET", path: "/push/devices", summary: "Browsers registered for push", ...authedRoute })
  .output(z.object({ devices: z.array(z.object({ label: z.string(), enabled: z.boolean() })) }))
  .handler(async ({ context }) => {
    const rows = await context.db
      .select({
        label: schema.userNotificationChannel.addressLabel,
        enabled: schema.userNotificationChannel.isEnabled,
      })
      .from(schema.userNotificationChannel)
      .where(
        and(
          eq(schema.userNotificationChannel.userId, context.user.id),
          eq(schema.userNotificationChannel.channelCode, "PUSH"),
        ),
      )
    // The endpoint is deliberately not returned. It is a bearer capability —
    // anyone holding it can push to that browser — and the UI never needs it.
    return { devices: rows }
  })

/** Follow a team, event or game. This is the opt-in that makes push mean anything. */
export const follow = authed
  .route({ method: "POST", path: "/follow", summary: "Follow an object", successStatus: 201, ...authedRoute })
  .input(ObjectRef)
  .output(z.object({ following: z.literal(true) }))
  .handler(async ({ context, input }) => {
    // Checked rather than trusted: `subscription.objectId` has no foreign key —
    // it cannot have one, because it points at six different tables — so this
    // is the only thing standing between the table and rows pointing nowhere.
    const table = tableForObjectType(input.objectTypeCode)
    if (!table || !(await objectExists(context.db, table, input.objectId))) {
      throw new ORPCError("NOT_FOUND", { message: "Not found" })
    }
    await context.db
      .insert(schema.subscription)
      .values({
        userId: context.user.id,
        objectTypeCode: input.objectTypeCode,
        objectId: input.objectId,
        subscribedAt: new Date().toISOString(),
      })
      .onConflictDoNothing()
    return { following: true as const }
  })

export const unfollow = authed
  .route({ method: "DELETE", path: "/follow", summary: "Stop following an object", ...authedRoute })
  .input(ObjectRef)
  .output(z.object({ following: z.literal(false) }))
  .handler(async ({ context, input }) => {
    await context.db
      .delete(schema.subscription)
      .where(
        and(
          eq(schema.subscription.userId, context.user.id),
          eq(schema.subscription.objectTypeCode, input.objectTypeCode),
          eq(schema.subscription.objectId, input.objectId),
        ),
      )
    return { following: false as const }
  })

/**
 * Everything this reader follows, and every type they have switched off.
 *
 * One call rather than two because the UI always needs both: a Follow button
 * has to know whether it is already following, and the settings page has to
 * know which switches are off. Two round trips to draw one screen is the kind
 * of thing that makes a phone feel slow.
 */
export const following = authed
  .route({ method: "GET", path: "/follow", summary: "What I follow, and what I have muted", ...authedRoute })
  .output(
    z.object({
      following: z.array(ObjectRef),
      muted: z.array(z.enum(NOTIFICATION_TYPE_CODES)),
    }),
  )
  .handler(async ({ context }) => {
    const [subs, prefs] = await Promise.all([
      context.db
        .select({
          objectTypeCode: schema.subscription.objectTypeCode,
          objectId: schema.subscription.objectId,
        })
        .from(schema.subscription)
        .where(eq(schema.subscription.userId, context.user.id)),
      context.db
        .select({ typeCode: schema.userNotificationPreference.notificationTypeCode })
        .from(schema.userNotificationPreference)
        .where(
          and(
            eq(schema.userNotificationPreference.userId, context.user.id),
            eq(schema.userNotificationPreference.channelCode, "PUSH"),
            eq(schema.userNotificationPreference.isEnabled, false),
          ),
        ),
    ])
    return {
      following: subs as z.infer<typeof ObjectRef>[],
      muted: prefs.map((p) => p.typeCode) as NotificationTypeCode[],
    }
  })

/**
 * Push one notification to the caller's own devices, and nobody else's.
 *
 * The only way to verify the chain end to end, and it has to be a button rather
 * than a test: whether a notification actually appears depends on the push
 * service, the OS, Focus modes and per-app settings — none of which exist in
 * CI, and none of which we can see. An automated browser cannot stand in
 * either: Chrome's push registration and Firefox's both need a live connection
 * to their vendor's service that automation builds do not have.
 *
 * Deliberately ignores both follow state and mutes. It answers "can this device
 * be reached at all", which is the question someone asks when nothing has
 * arrived — and answering it through the same filters that might be the reason
 * would tell them nothing.
 */
export const sendTest = authed
  .route({ method: "POST", path: "/push/test", summary: "Push a test notification to my own devices", ...authedRoute })
  .input(z.object({ locale: z.enum(LOCALES).optional() }))
  .output(z.object({ sent: z.number(), gone: z.number() }))
  .handler(async ({ context, input }) => {
    const rows = await context.db
      .select({ address: schema.userNotificationChannel.address })
      .from(schema.userNotificationChannel)
      .where(
        and(
          eq(schema.userNotificationChannel.userId, context.user.id),
          eq(schema.userNotificationChannel.channelCode, "PUSH"),
          eq(schema.userNotificationChannel.isEnabled, true),
        ),
      )

    const locale = input.locale ?? (LOCALES[0] as (typeof LOCALES)[number])
    return sendToAddresses(
      context.db,
      context.env,
      rows.map((r) => r.address),
      {
        title: m.test_notification_title({}, { locale }),
        body: m.test_notification_body({}, { locale }),
        url: "#/profile",
        // A fixed tag, so pressing the button twice replaces the first card
        // rather than leaving a pile of identical ones to clear.
        tag: "test",
      },
    )
  })

/** Mute or unmute one notification type on push. */
export const setPreference = authed
  .route({ method: "PUT", path: "/notification-preferences", summary: "Mute or unmute one kind of notification", ...authedRoute })
  .input(
    z.object({
      notificationTypeCode: z.enum(NOTIFICATION_TYPE_CODES),
      isEnabled: z.boolean(),
    }),
  )
  .output(z.object({ ok: z.literal(true) }))
  .handler(async ({ context, input }) => {
    const where = and(
      eq(schema.userNotificationPreference.userId, context.user.id),
      eq(schema.userNotificationPreference.notificationTypeCode, input.notificationTypeCode),
      eq(schema.userNotificationPreference.channelCode, "PUSH"),
    )
    const existing = await context.db
      .select({ userId: schema.userNotificationPreference.userId })
      .from(schema.userNotificationPreference)
      .where(where)

    if (existing.length > 0) {
      await context.db
        .update(schema.userNotificationPreference)
        .set({ isEnabled: input.isEnabled })
        .where(where)
    } else {
      await context.db.insert(schema.userNotificationPreference).values({
        userId: context.user.id,
        notificationTypeCode: input.notificationTypeCode,
        channelCode: "PUSH",
        isEnabled: input.isEnabled,
      })
    }
    return { ok: true as const }
  })
