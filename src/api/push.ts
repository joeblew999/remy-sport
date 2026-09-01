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
import * as schema from "../db/schema"
import type { Db } from "./db"
import { audienceFor, inBatches } from "./relations"
import { TRANSPORTS, type Recipient, type Rendered } from "./transports"
/**
 * The protocol layer. `PushBody` is re-exported because src/web/sw.ts and
 * src/web/lib/native-notify.ts import it from here and the payload contract is
 * theirs to depend on — moving the declaration should not move the import.
 */
import { deliverPush, vapidFrom, type PushBody } from "./push-send"
export { vapidFrom, type PushBody }
import type { Bindings } from "../types"
import { LOCALES, type ReleasedLocale } from "../domain/vocabularies"
import { FALLBACK } from "../domain/names"
import type { NotificationTypeCode, ObjectTypeCode } from "../domain/vocabularies"



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

const released = new Set<string>(LOCALES)
const asLocale = (raw: string | null): ReleasedLocale =>
  raw && released.has(raw) ? (raw as ReleasedLocale) : (FALLBACK as ReleasedLocale)



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

  /**
   * Batched, because a popular game exceeds SQLite's bound-parameter limit.
   *
   * These were raw `inArray(...)` over every user in the audience, and D1 fails
   * the statement outright — "too many SQL variables" — rather than returning a
   * short answer. So a game with a hundred-odd followers notified *nobody*, and
   * the bigger the audience the more certain the failure. Found by the chunking
   * test written for the queue, at 111 users.
   *
   * The same ceiling `MAX_IN` in ./relations.ts exists for, reused rather than
   * re-derived. Note this is a *second* limit in this path: chunking delivery
   * does not help, because the audience query blows up before a single push
   * goes out.
   */
  const [rows, prefs] = await Promise.all([
    inBatches(userIds, (batch) =>
      db
        .select({
          userId: schema.userNotificationChannel.userId,
          channelCode: schema.userNotificationChannel.channelCode,
          address: schema.userNotificationChannel.address,
          secret: schema.userNotificationChannel.secret,
          localeCode: schema.userNotificationChannel.localeCode,
        })
        .from(schema.userNotificationChannel)
        .where(
          and(
            inArray(schema.userNotificationChannel.userId, batch),
            eq(schema.userNotificationChannel.isEnabled, true),
          ),
        ),
    ),
    /**
     * Every stored preference for this type, not only the negative ones.
     *
     * This used to select `isEnabled = false` and treat absence as consent,
     * which is right for push and wrong for everything else — see
     * `wantsChannel` below. Batched for the same reason as above, and it
     * matters more here: this is the mute list, so a failed statement is not
     * "nobody is muted", it is the whole send dying.
     */
    inBatches(userIds, (batch) =>
      db
        .select({
          userId: schema.userNotificationPreference.userId,
          channelCode: schema.userNotificationPreference.channelCode,
          isEnabled: schema.userNotificationPreference.isEnabled,
        })
        .from(schema.userNotificationPreference)
        .where(
          and(
            inArray(schema.userNotificationPreference.userId, batch),
            eq(schema.userNotificationPreference.notificationTypeCode, typeCode),
          ),
        ),
    ),
  ])

  const stated = new Map(prefs.map((p) => [`${p.userId}|${p.channelCode}`, p.isEnabled]))
  const grouped = new Map<string, Recipient[]>()
  for (const row of rows) {
    if (!wantsChannel(stated.get(`${row.userId}|${row.channelCode}`), row.channelCode)) continue
    const list = grouped.get(row.channelCode) ?? []
    list.push({ userId: row.userId, address: row.address, secret: row.secret, localeCode: row.localeCode })
    grouped.set(row.channelCode, list)
  }
  return grouped
}

/**
 * Whether an unstated preference means yes.
 *
 * **PUSH is opt-out and everything else is opt-in**, and the asymmetry is
 * deliberate rather than an oversight.
 *
 * Push already required an explicit act: the reader installed the app, granted
 * the OS permission and registered a subscription. Absence of a preference
 * after all that is consent, and it is what `audienceFor` has always assumed.
 *
 * An email address is not that. It arrives because somebody signed up, and
 * nobody signing up asked to be emailed about every score in a tournament. If
 * absence meant yes here, adding EMAIL as a transport would have started
 * emailing every seeded account the moment this shipped — a change to a
 * dispatch table silently becoming a change to what lands in people's inboxes.
 *
 * So a new channel reaches nobody until somebody turns it on, per type, per
 * person. That is also what makes this change safe to deploy before the
 * preferences UI exists.
 */
export function wantsChannel(stated: boolean | undefined, channelCode: string): boolean {
  if (stated !== undefined) return stated
  return channelCode === "PUSH"
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
    /**
     * One renderer per channel, called once per locale present in the audience.
     *
     * A channel with no renderer here is not sent on — see the note at the top
     * of ./transports.ts. That is what stops push copy being posted as an email
     * body: there is no shared shape to fall back to.
     */
    render: Partial<Record<string, (locale: ReleasedLocale, tag: string) => Rendered>>
    /**
     * Collapse key. A second SCORE_UPDATE for the same game replaces the first
     * instead of stacking, so a close game does not leave forty cards to
     * dismiss. Sent as the push service's `topic` and as the browser's `tag`.
     */
    tag: string
    /** The actor. Nobody needs telling about the thing they just did. */
    exclude?: string
    /**
     * Deliver a slice, starting after this many recipients.
     *
     * One `fetch` goes out per recipient and the Workers subrequest limit is
     * per request, so a large audience has to be split across messages. The
     * caller re-enqueues while `remaining` is non-zero — see
     * ./notify-queue.ts.
     */
    offset?: number
    limit?: number
    /** Telemetry only: which path produced this. See `push.batch`. */
    source?: string
  },
): Promise<{ sent: number; gone: number; remaining: number }> {
  const byChannel = await audience(db, args.typeCode, args.targets, args.exclude)

  /**
   * A stable order, so slicing by offset means the same thing across messages.
   *
   * Flattened across channels first, so one offset walks the whole audience:
   * paging each channel separately would need an offset per channel in the
   * queue message, and a channel added later would silently reset the others'
   * paging. Sorted by (channel, address) so the order does not depend on what
   * D1 happened to return.
   */
  const ordered = [...byChannel.entries()]
    .flatMap(([channel, rs]) => rs.map((r) => ({ channel, ...r })))
    .sort((a, b) =>
      a.channel === b.channel
        ? a.address < b.address
          ? -1
          : a.address > b.address
            ? 1
            : 0
        : a.channel < b.channel
          ? -1
          : 1,
    )

  const offset = args.offset ?? 0
  const slice = ordered.slice(offset, offset + (args.limit ?? ordered.length))
  const remaining = Math.max(0, ordered.length - (offset + slice.length))
  if (slice.length === 0) return { sent: 0, gone: 0, remaining: 0 }

  let sent = 0
  let gone = 0
  for (const [channel, recipients] of groupBy(slice, (r) => String(r.channel))) {
    const transport = TRANSPORTS[channel]
    const render = args.render[channel]
    /**
     * No transport, or no copy for this channel.
     *
     * Counted and reported rather than skipped in silence. The vocabulary
     * describes five channels and this Worker can deliver on two, and a caller
     * may have written push copy and not email copy — both are states worth
     * seeing in `notify.batch` rather than discovering as "some people never
     * got told".
     */
    if (!transport || !render) {
      track(env, "notify.batch", {
        type: String(args.typeCode),
        channel,
        service: transport ? "no-copy" : "no-transport",
        source: args.source ?? "sync",
        sent: 0,
        gone: 0,
        failed: recipients.length,
      })
      continue
    }

    // Rendered once per locale, not once per recipient: an arena full of
    // followers is still at most three strings.
    const content = new Map<string, Rendered>()
    for (const r of recipients) {
      const locale = asLocale(r.localeCode)
      if (!content.has(locale)) content.set(locale, render(locale, args.tag))
    }
    const fallback = content.get(asLocale(null)) ?? render(asLocale(null), args.tag)

    const result = await transport.send(db, env, recipients, content, fallback, String(args.typeCode))
    sent += result.sent
    gone += result.gone
    track(env, "notify.batch", {
      type: String(args.typeCode),
      channel,
      service: "-",
      source: args.source ?? "sync",
      sent: result.sent,
      gone: result.gone,
      failed: result.failed,
    })
  }

  return { sent, gone, remaining }
}

/** Group by a key, preserving order. */
function groupBy<T>(xs: T[], key: (x: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>()
  for (const x of xs) {
    const k = key(x)
    const list = out.get(k) ?? []
    list.push(x)
    out.set(k, list)
  }
  return out
}

/**
 * Send one already-rendered notification to a list of stored addresses.
 *
 * The half that talks to push services, shared by `notify` and by the test
 * button — including the pruning of dead endpoints, which must happen wherever
 * we discover one rather than only on the path that usually does.
 */
/**
 * Send one already-rendered notification to a list of stored addresses.
 *
 * The half that talks to push services, shared by `notify` and by the test
 * button — including the pruning of dead endpoints, which must happen wherever
 * we discover one rather than only on the path that usually does.
 */
/**
 * `deliver`, for a caller that already knows which rows it means — the test
 * button, which deliberately bypasses following and mutes.
 *
 * Rows that cannot be sent to (a PUSH row with no keys) are dropped here rather
 * than counted as failures: they are not a delivery problem, they are a row
 * that predates the keys having a column of their own.
 */
export async function sendToRows(
  db: Db,
  env: Bindings,
  rows: { address: string; secret: string | null; localeCode: string | null }[],
  body: PushBody,
): Promise<{ sent: number; gone: number }> {
  // Through the same push transport `notify` uses, so the test button and a
  // real notification cannot diverge about encryption, 410 handling or
  // telemetry. It stays synchronous and push-only: the user is standing there,
  // and the whole value of the button is `{ sent, gone }` coming straight back.
  const { sent, gone } = await deliverPush(
    db,
    env,
    rows.map((row) => ({ address: row.address, secret: row.secret, body })),
  )
  return { sent, gone }
}
