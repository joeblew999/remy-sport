/**
 * What the API did, as one event per call.
 *
 * An interceptor rather than a line in each handler: there are fifty-six
 * procedures, and a rule enforced in one place cannot be forgotten in the
 * fifty-seventh. It also makes the shape uniform, which is the difference
 * between a dataset you can query and a pile of strings.
 *
 * ## Failures always, successes sampled
 *
 * This recorded only failures until an hour went into guessing why one endpoint
 * took 0.23s. Failures cannot answer "what is slow", because a slow endpoint is
 * one that *works* — every request that mattered to that question wrote no row
 * at all, so `mise run analytics` reported the p50 of *failures* and the only
 * way left to measure was hand-written `curl` loops.
 *
 * Successes are sampled because Analytics Engine bills by data point and this
 * Worker fronts every asset request too. The rate is not fixed: see
 * `sampleRate` below.
 *
 * ## Why the failure path is a `catch` and not a status check
 *
 * oRPC's own try/catch sits *outside* the interceptor chain
 * (`StandardHandler.handle`): a procedure that throws propagates out through
 * here first, and only then is converted into a 4xx or 5xx response. So every
 * failure arrives as a throw and none of them arrive as a status — an earlier
 * version of this file also inspected `result.response.status` and that branch
 * could never have run.
 *
 * That ordering is a gift rather than an obstacle. It means the *original*
 * error is visible here, before `toORPCError` flattens anything unrecognised
 * into INTERNAL_SERVER_ERROR, which is exactly the distinction worth recording:
 * a `FORBIDDEN` is the system working and a `TypeError` is not.
 */

import { keepsEventsLocally, track } from "../analytics"
import type { Bindings } from "../types"

/**
 * What oRPC hands an interceptor, as much of it as this needs.
 *
 * Structural rather than imported: oRPC's own type is parameterised by the
 * router's entire merged context, a page-long expression that changes whenever
 * a middleware is added. Naming the fields used here says what this actually
 * depends on and survives that. `url` is a `URL` — the standard-server request
 * is not a `Request`.
 */
interface InterceptorOptions {
  request: { url: URL; method: string }
  /** `request` here is the raw platform Request, which is what carries `cf`. */
  context: { env?: Bindings; request?: { cf?: { country?: string } } }
  next: () => Promise<unknown>
}

/**
 * A refusal carries a code and a status; a bug carries neither.
 *
 * `FORBIDDEN`, `NOT_FOUND`, `UNAUTHORIZED` are the system telling someone no,
 * and they are worth counting — a spike of `FORBIDDEN` on one procedure is
 * either an authorisation bug or somebody probing. A `TypeError` is a line of
 * ours that is wrong. Recording them under one event name would bury the
 * handful that need fixing under the thousands that are working as designed.
 */
function classify(err: unknown): { event: "api.refused" | "api.threw"; label: string; status: number } {
  const e = err as { code?: unknown; status?: unknown; name?: unknown } | null
  if (typeof e?.code === "string" && typeof e.status === "number") {
    return { event: "api.refused", label: e.code, status: e.status }
  }
  return {
    event: "api.threw",
    label: typeof e?.name === "string" ? e.name : "UnknownError",
    status: 500,
  }
}

/**
 * `/api/games/gam_002/score` → `/api/games/:id/score`.
 *
 * Without this every id is its own row and the dataset answers "one failure on
 * each of four hundred games" instead of "four hundred failures on games".
 */
export function routeShape(pathname: string): string {
  return pathname
    .split("/")
    .map((part) => (/^[a-z]{2,6}_[\w-]+$/i.test(part) || /^[0-9a-f-]{16,}$/i.test(part) ? ":id" : part))
    .join("/")
}

/**
 * How many requests one recorded success stands for.
 *
 * **One, on a dev server.** Sampling there would defeat the purpose: the whole
 * point of the local ring is that you make a request, run `mise run analytics`,
 * and see it. At one-in-ten you make ten requests and see nothing, decide the
 * telemetry is broken, and go back to `curl`.
 *
 * Ten on a deployment, where the traffic makes a percentile out of a sample and
 * the billing makes a row per request wasteful. Uniform, so the percentiles stay
 * honest — the tempting alternative of "always record the slow ones, sample the
 * rest" biases every percentile upward and quietly turns the median into a
 * number that describes nothing.
 */
function sampleRate(env: Bindings | Record<string, never>): number {
  return keepsEventsLocally(env as Bindings) ? 1 : 10
}

export function telemetryInterceptor(options: InterceptorOptions): Promise<unknown> {
  const started = Date.now()
  const env = options.context.env ?? {}
  const route = routeShape(options.request.url.pathname)
  const method = options.request.method
  const country = options.context.request?.cf?.country

  /**
   * Two arguments to `then`, not `.then().catch()`.
   *
   * With the chained form the failure handler also catches anything the success
   * handler throws, and would report a bug in the telemetry as an `api.threw`
   * against the procedure — a self-inflicted error, attributed to the innocent
   * route it was measuring. This shape can only see what `next()` rejected with.
   */
  return options.next().then(
    (result) => {
      const rate = sampleRate(env)
      if (rate === 1 || Math.random() * rate < 1) {
        track(env, "api.served", { route, method, ms: Date.now() - started, rate }, country)
      }
      return result
    },
    (err: unknown) => {
      const { event, label, status } = classify(err)
      track(
        env,
        event,
        {
          route,
          method,
          // `code` on a refusal, `error` on a throw. Both are declared in
          // EVENTS, so passing the wrong one for the wrong event does not
          // compile.
          ...(event === "api.refused" ? { code: label } : { error: label }),
          ms: Date.now() - started,
          status,
        },
        country,
      )
      // Rethrown so oRPC's own handler still turns this into the response it
      // would have. Telemetry observes; it must not change what the caller sees.
      throw err
    },
  )
}
