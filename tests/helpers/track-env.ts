/**
 * A telemetry environment that records instead of writing, typed as the real one.
 *
 * Two files each built this by hand and cast it away with `as never`, and the
 * cast was hiding a genuine mismatch: their stub was declared
 * `writeDataPoint: (p: Point) => void`, while Cloudflare's signature is
 * `writeDataPoint(event?: AnalyticsEngineDataPoint): void`. The fake was
 * *stricter* than the thing it stood in for — it could not be called with no
 * argument, which the real binding allows and which `track()` is entitled to do.
 *
 * A fake that refuses inputs the real one accepts is the kind of difference that
 * makes a test pass while production fails, so it is the last thing that should
 * be cast away.
 */

import type { TrackEnv } from "../../src/analytics"

/**
 * What Analytics Engine actually receives.
 *
 * The real `AnalyticsEngineDataPoint`, not a local shape that resembles it. Both
 * test files declared their own `{ blobs?: unknown[]; doubles?: unknown[] }`,
 * which types `blobs` loosely enough that writing a number where a string
 * belongs would not have been caught — in a system whose columns are twenty
 * anonymous slots with no schema and no error for filling the wrong one.
 */
export type Point = AnalyticsEngineDataPoint

/**
 * An env that behaves like a deployment, plus the points it received.
 *
 * `MAIL_TRANSPORT: "cloudflare"` is load-bearing rather than decoration: it is
 * this codebase's "not a dev server" flag, and without it `track` keeps the
 * event in the local ring and writes nothing — which is correct behaviour, and
 * makes every assertion about `written` silently vacuous.
 */
export function recorder(): { written: Point[]; env: TrackEnv } {
  const written: Point[] = []
  return {
    written,
    env: {
      MAIL_TRANSPORT: "cloudflare",
      ANALYTICS: {
        // `event?` — optional, because the binding's signature says so.
        writeDataPoint: (event?: Point) => {
          if (event) written.push(event)
        },
      },
    },
  }
}

/**
 * A deployment whose dataset is broken.
 *
 * Telemetry must never take down the request it is measuring, so a throwing
 * write is an ordinary case rather than an edge one.
 */
export function failingRecorder(): TrackEnv {
  return {
    MAIL_TRANSPORT: "cloudflare",
    ANALYTICS: {
      writeDataPoint: () => {
        throw new Error("dataset unavailable")
      },
    },
  }
}

/**
 * A dev server: no dataset bound, so events are kept in memory instead.
 *
 * Both fields on `TrackEnv` are optional, which is the contract — `wrangler dev`
 * and every worker test run without the binding, and a missing dataset has to
 * degrade to "no telemetry" rather than to a failed request.
 */
export const devEnv: TrackEnv = {}

/** A deployment with no dataset bound — the case that used to throw. */
export const unboundEnv: TrackEnv = { MAIL_TRANSPORT: "cloudflare" }
