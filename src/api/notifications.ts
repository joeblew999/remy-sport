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

import { and, eq, sql } from "drizzle-orm"
import { ORPCError } from "@orpc/server"
import { z } from "zod"
import * as schema from "../db/schema"
import { authed, authedRoute, can, pub, type Db } from "./base"
import { sendToRows, vapidFrom } from "./push"
import {
  GRANTS,
  LOCALES,
  NOTIFICATION_TYPE_CODES,
  OBJECT_TYPE_CODES,
  type NotificationTypeCode,
  type ObjectTypeCode,
} from "../domain/vocabularies"
import { objectExists, tableForObjectType } from "./relations"
import { m } from "../paraglide/messages.js"
import { pivot, type Names } from "../domain/names"

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
    // One statement, because the endpoint is the row's identity and the
    // database enforces it. This was a select of every row the user had, an
    // `.includes()` scan in JavaScript, and then a branch into an update or an
    // insert — all of it standing in for a unique index that did not exist.
    //
    // `onConflictDoUpdate` also gets the transfer case right, which the old
    // branch did not: if a browser was registered to one account and someone
    // else signs in on it, the row moves rather than colliding.
    await context.db
      .insert(schema.userNotificationChannel)
      .values({
        userId: context.user.id,
        channelCode: "PUSH",
        address: input.subscription.endpoint,
        addressLabel: input.label,
        secret: JSON.stringify(input.subscription.keys),
        localeCode: input.locale ?? null,
        isEnabled: true,
        // Nothing to verify: the browser handed us the endpoint directly and a
        // push either reaches it or 410s. Unlike email or SMS there is no
        // address a reader could mistype into someone else's inbox.
        verifiedAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: [
          schema.userNotificationChannel.channelCode,
          schema.userNotificationChannel.address,
        ],
        set: {
          userId: context.user.id,
          addressLabel: input.label,
          secret: JSON.stringify(input.subscription.keys),
          localeCode: input.locale ?? null,
          isEnabled: true,
        },
      })
    return { ok: true as const }
  })

/** Forget this browser. Called when a reader turns notifications off. */
export const unsubscribe = authed
  .route({ method: "POST", path: "/push/unsubscribe", summary: "Stop pushing to this browser", ...authedRoute })
  .input(z.object({ endpoint: z.string().url() }))
  .output(z.object({ removed: z.number() }))
  .handler(async ({ context, input }) => {
    // Scoped to the caller as well as the endpoint: holding somebody else's
    // endpoint must not let you switch their notifications off.
    const removed = await context.db
      .delete(schema.userNotificationChannel)
      .where(
        and(
          eq(schema.userNotificationChannel.userId, context.user.id),
          eq(schema.userNotificationChannel.channelCode, "PUSH"),
          eq(schema.userNotificationChannel.address, input.endpoint),
        ),
      )
      .returning({ address: schema.userNotificationChannel.address })
    return { removed: removed.length }
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

/**
 * Which action governs following each kind of object.
 *
 * The model has FOLLOW_/UNFOLLOW_ for exactly three object types, so those are
 * the three that can be followed. Anything else is refused rather than stored:
 * a `subscription` row for a type the model does not model is a row that
 * notifies nobody, and a Follow button that silently does nothing is worse than
 * one that is not offered.
 */
const FOLLOW_ACTION = {
  TEAM: { follow: "FOLLOW_TEAM", unfollow: "UNFOLLOW_TEAM" },
  EVENT: { follow: "FOLLOW_EVENT", unfollow: "UNFOLLOW_EVENT" },
  PLAYER: { follow: "FOLLOW_PLAYER", unfollow: "UNFOLLOW_PLAYER" },
} as const satisfies Partial<Record<ObjectTypeCode, { follow: string; unfollow: string }>>

const followActionFor = (code: string) =>
  (FOLLOW_ACTION as Record<string, { follow: string; unfollow: string } | undefined>)[code]

/** Follow a team, event or player. This is the opt-in that makes push mean anything. */
export const follow = authed
  .route({ method: "POST", path: "/follow", summary: "Follow an object", successStatus: 201, ...authedRoute })
  .input(ObjectRef)
  .output(z.object({ following: z.literal(true) }))
  .handler(async ({ context, input }) => {
    const action = followActionFor(input.objectTypeCode)
    // Not rendered as prose — see src/api/errors.ts on why 400/403/404 stay
    // bare. The UI only offers the three the model models, so reaching this is
    // a caller error, not something a reader is shown.
    if (!action) throw new ORPCError("BAD_REQUEST")

    // Checked rather than trusted: `subscription.objectId` has no foreign key —
    // it cannot have one, because it points at six different tables — so this
    // is the only thing standing between the table and rows pointing nowhere.
    const table = tableForObjectType(input.objectTypeCode)
    if (!table || !(await objectExists(context.db, table, input.objectId))) {
      throw new ORPCError("NOT_FOUND", { message: "Not found" })
    }

    // The model's answer, not a hand-rolled one. FOLLOW_* is granted to
    // ANY_SIGNED_IN today, so this permits everyone who gets this far — which
    // is the point: when the PO narrows it, this narrows with it and nothing
    // here changes.
    if (!(await can(context.db, action.follow as keyof typeof GRANTS, context.user, input.objectId))) {
      throw new ORPCError("FORBIDDEN")
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
    const action = followActionFor(input.objectTypeCode)
    // UNFOLLOW_* is granted to FOLLOWER_* and PLATFORM_ADMIN, so this is the
    // model saying "you may stop following what you follow" — and it is what
    // lets an admin clear somebody's subscription without a special case here.
    if (
      action &&
      !(await can(context.db, action.unfollow as keyof typeof GRANTS, context.user, input.objectId))
    ) {
      throw new ORPCError("FORBIDDEN")
    }
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
      following: z.array(
        ObjectRef.extend({
          /** The model's names, for the client to resolve to the reader's locale. */
          names: z.record(z.string(), z.string()),
          /** English pivot, as a fallback when the reader's locale is absent. */
          name: z.string(),
        }),
      ),
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
      following: await withNames(context.db, subs as z.infer<typeof ObjectRef>[]),
      muted: prefs.map((p) => p.typeCode) as NotificationTypeCode[],
    }
  })

/**
 * Put a name on each thing a reader follows.
 *
 * Without this the list is the *type* of each row — "Team, Team, Team" for
 * somebody following three of them, which tells them nothing and is not a list
 * they can act on. `subscription` stores only a type and an id, so the name has
 * to be fetched from whichever table that type lives in.
 *
 * One query per type present, not one per row: a reader following twenty teams
 * is one `IN`. Names come back as the model's JSON, matching every other
 * endpoint — the client resolves the locale, so this stays the same bytes for
 * every reader and the cache does not fragment by language.
 */
async function withNames(db: Db, subs: z.infer<typeof ObjectRef>[]) {
  const byType = new Map<string, string[]>()
  for (const sub of subs) {
    const list = byType.get(sub.objectTypeCode) ?? []
    list.push(sub.objectId)
    byType.set(sub.objectTypeCode, list)
  }

  const names = new Map<string, Names>()
  await Promise.all(
    [...byType].map(async ([objectTypeCode, ids]) => {
      const table = tableForObjectType(objectTypeCode)
      // GAME has no `names` column — a fixture is named by its two teams, not
      // by a string — so it falls through to the type label until something
      // offers a Follow button on a game.
      if (!table || objectTypeCode === "GAME") return
      const rows = await db.all<{ id: string; names: string | null }>(
        sql`SELECT ${sql.identifier("id")}, ${sql.identifier("names")}
            FROM ${sql.identifier(table)}
            WHERE ${sql.identifier("id")} IN (${sql.join(
              ids.map((id) => sql`${id}`),
              sql`, `,
            )})`,
      )
      for (const row of rows) {
        // D1 hands back a JSON column as text; drizzle only parses it when the
        // read went through a typed table, and this one is dynamic by necessity.
        names.set(`${objectTypeCode}:${row.id}`, parseNames(row.names))
      }
    }),
  )

  return subs.map((sub) => {
    const found = names.get(`${sub.objectTypeCode}:${sub.objectId}`) ?? {}
    return { ...sub, names: found, name: pivot(found) ?? "" }
  })
}

function parseNames(raw: string | null): Names {
  if (!raw) return {}
  try {
    return (typeof raw === "string" ? JSON.parse(raw) : raw) as Names
  } catch {
    return {}
  }
}

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
      .select({
        address: schema.userNotificationChannel.address,
        secret: schema.userNotificationChannel.secret,
        localeCode: schema.userNotificationChannel.localeCode,
      })
      .from(schema.userNotificationChannel)
      .where(
        and(
          eq(schema.userNotificationChannel.userId, context.user.id),
          eq(schema.userNotificationChannel.channelCode, "PUSH"),
          eq(schema.userNotificationChannel.isEnabled, true),
        ),
      )

    const locale = input.locale ?? (LOCALES[0] as (typeof LOCALES)[number])
    return sendToRows(context.db, context.env, rows, {
        title: m.test_notification_title({}, { locale }),
        body: m.test_notification_body({}, { locale }),
        url: "#/profile",
      // A fixed tag, so pressing the button twice replaces the first card
      // rather than leaving a pile of identical ones to clear.
      tag: "test",
    })
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
