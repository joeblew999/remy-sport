/**
 * Product telemetry: what happened, where, and how often.
 *
 * An app-level capability whose first consumer happens to be the MoQ video
 * demo. It is deliberately not a MoQ pipeline — rate-limit rejections,
 * procedure failures and feature usage all belong in the same dataset keyed by
 * an `event` string, because the questions worth asking cut across features.
 * "What is failing, where, how often" is one query or it is three dashboards
 * nobody opens.
 *
 * Analytics Engine rather than D1. A D1 row is a fact somebody can edit and a
 * foreign key means something; this is append-only, unbounded, and read only in
 * aggregate — which is the shape D1 is worst at and this is built for.
 *
 * **It can never fail a request.** Every call is wrapped and returns silently:
 * telemetry that can take down the thing it measures is worse than no telemetry
 * at all, and the binding is legitimately absent under `wrangler dev` and in
 * every worker test.
 */

import type { Bindings } from "./types"

export interface TrackedEvent {
  /**
   * What happened, as a stable string — `moq.session`, `signin.refused`.
   *
   * Written as the first blob so every query starts by filtering on it. A
   * dataset without that convention is one where finding anything means
   * remembering which column a feature chose.
   */
  event: string
  /** Strings: ids, codes, error names. */
  blobs?: (string | undefined)[]
  /** Numbers: durations, counts, bitrates. */
  doubles?: (number | undefined)[]
  /** The sampling key. Analytics Engine samples per index at high volume. */
  index?: string
}

export function track(env: Pick<Bindings, "ANALYTICS">, e: TrackedEvent): void {
  try {
    if (!env.ANALYTICS) return
    env.ANALYTICS.writeDataPoint({
      // Undefined becomes a blank rather than a hole. Analytics Engine matches
      // blobs by position, so a dropped entry shifts every later field into the
      // wrong column — and the sessions most worth reading are exactly the ones
      // missing fields, because they are the ones that went wrong.
      blobs: [e.event, ...(e.blobs ?? []).map((b) => b ?? "")],
      doubles: (e.doubles ?? []).map((d) => d ?? 0),
      indexes: [e.index ?? e.event],
    })
  } catch {
    // Deliberately silent. A rejected write, a malformed point, a binding that
    // is not what we think it is — none of them are worth a 500 on a request
    // that had otherwise succeeded.
  }
}
