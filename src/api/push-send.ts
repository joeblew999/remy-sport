/**
 * Talking to a push service: the half that knows the protocol.
 *
 * Split out of ./push.ts when the send path became channel-agnostic, and the
 * dependency checker is what insisted: `push.ts` dispatches through
 * ./transports.ts, and ./transports.ts needs the push transport, so leaving
 * both in one file was a cycle — `check:deps` failed with `no-circular:
 * src/api/push.ts`.
 *
 * The seam it forced is the right one anyway. Everything here is Web Push and
 * only Web Push: VAPID, RFC 8291 encryption, what a 410 means, which vendor
 * took the request. None of it generalises to email or to anything else, and
 * none of it should have to know that other channels exist.
 *
 * The dispatcher — audience resolution, per-channel routing, the renderers —
 * stays in ./push.ts for now. That file's name has outlived its contents and
 * renaming it is a separate change, deliberately: a move and a behaviour change
 * in one commit are two things nobody can review independently.
 */

import { and, eq, inArray } from "drizzle-orm"
import * as schema from "../db/schema"
import { buildPush, type PushSubscription } from "./webpush"
import { track } from "../analytics"
import type { Db } from "./base"
import type { Bindings } from "../types"

/** Exactly what src/web/sw.ts reads out of `event.data`. */
export type PushBody = {
  title: string
  body: string
  url: string
  tag: string
}

/**
 * The three secrets, or null.
 *
 * Push is optional infrastructure: a deployment with no keys serves the whole
 * app and simply never sends. Every caller checks rather than throwing — a
 * missing key must not turn entering a score into a 500.
 */
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

export function vapidFrom(env: Bindings) {
  const { VAPID_SUBJECT: subject, VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey } = env
  return subject && publicKey && privateKey ? { subject, publicKey, privateKey } : null
}


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

/** One browser to push to, with the body already rendered for its locale. */
export type PushTarget = { address: string; secret: string | null; body: PushBody }

/**
 * The push transport, called through the map in ./transports.ts.
 *
 * Still here rather than moved there: this is the half that knows about VAPID,
 * RFC 8291 encryption and what a 410 means, and none of that generalises. What
 * moved is the *dispatch*, not the protocol.
 */
export async function deliverPush(
  db: Db,
  env: Bindings,
  rows: PushTarget[],
): Promise<{ sent: number; gone: number; failed: number; configured: boolean }> {
  const targets = rows.flatMap((row) => {
    const device = toDevice({ address: row.address, secret: row.secret, localeCode: null })
    return device ? [{ address: row.address, subscription: device.subscription, body: row.body }] : []
  })
  return deliver(db, env, targets, targets[0]?.body.tag ?? "")
}

async function deliver(
  db: Db,
  env: Bindings,
  targets: { address: string; subscription: PushSubscription; body: PushBody }[],
  tag: string,
): Promise<{ sent: number; gone: number; failed: number; configured: boolean }> {
  const vapid = vapidFrom(env)
  /**
   * No keys is not the same answer as nothing to send, and it used to be.
   *
   * Both came back as three zeros, so a deployment with no VAPID configured was
   * indistinguishable from a reader with no devices — and the test button said
   * "sent to 0 devices" for both. `configured: false` is the difference, and it
   * is the one a reader cannot fix themselves.
   */
  if (!vapid) return { sent: 0, gone: 0, failed: 0, configured: false }

  const dead: string[] = []
  const results = await Promise.allSettled(
    targets.map(async ({ address, subscription, body }) => {
      /**
       * Anything that throws before the response, logged too.
       *
       * `failed` is computed as total − sent − gone, so a REJECTED promise
       * counts as a failure — and the refusal log below sits after `fetch`, so
       * those left no trace whatsoever. Measured on 2026-09-02 against dev:
       * `{ failed: 1 }` with nothing anywhere saying why, because `buildPush`
       * threw during ECDH on a malformed p256dh and never reached the request.
       *
       * Encryption faults, DNS, a refused connection and a timeout all land
       * here. They are the failures least likely to be guessable from the
       * outside, which makes them the ones most worth naming.
       */
      const payload = await buildPush(subscription, body, vapid, {
        topic: tag,
        urgency: "high",
      }).catch((e: unknown) => {
        console.warn(
          `push could not be built for ${pushService(subscription.endpoint)}:`,
          e instanceof Error ? e.message : e,
        )
        throw e
      })
      const res = await fetch(subscription.endpoint, {
        method: payload.method,
        headers: payload.headers,
        body: payload.body,
      }).catch((e: unknown) => {
        // Never reached the service: DNS, refused, timed out. Distinct from a
        // service that answered and said no, and the reader's fix is different.
        console.warn(
          `push never reached ${pushService(subscription.endpoint)}:`,
          e instanceof Error ? e.message : e,
        )
        throw e
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
      /**
       * The refusal, where a person can read it.
       *
       * `track` already records the status, but Analytics Engine is unbound in
       * local dev and its rows are a no-op there — so a failed test push left
       * NOTHING anywhere. Chasing one on 2026-09-02 got as far as "a real Apple
       * subscription exists and the send happened" and stopped, because the
       * status code existed only inside this closure.
       *
       * The body is what says WHY: Apple returns `BadJwtToken` for a VAPID
       * subject it will not accept, which is unguessable from a bare 403.
       * Truncated because a push service is free to return a page.
       */
      if (!res.ok) {
        const why = await res.text().catch(() => "")
        console.warn(
          `push refused: ${res.status} from ${new URL(subscription.endpoint).host}` +
            (why ? ` — ${why.slice(0, 200)}` : ""),
        )
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
  /**
   * Per push service, and push-shaped on purpose.
   *
   * `notify` reports the batch per *channel*; this reports it per *vendor*,
   * which only means something for push. Apple, FCM and Mozilla each enforce
   * the RFCs differently, and the way this breaks is one of them rejecting
   * everything while the others carry on — a single count averages that into
   * "mostly fine". `source: "vendor"` marks these as the per-vendor breakdown
   * rather than a second count of the same batch.
   */
  for (const [service, counts] of perService) {
    // Synchronous, swallows its own errors, and writes at most four points —
    // see `write` in src/analytics.ts. It cannot throw into the send path and
    // adds no latency. A no-op when ANALYTICS is unbound.
    track(env, "notify.batch", { type: "-", channel: "PUSH", service, source: "vendor", ...counts })
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

  const counted = (kind: Outcome) =>
    results.filter((r) => r.status === "fulfilled" && r.value === kind).length
  return {
    sent: counted("sent"),
    gone: dead.length,
    failed: results.length - counted("sent") - dead.length,
    configured: true,
  }
}
