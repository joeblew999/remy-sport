import { describe, expect, it } from "vitest"
import { routeShape, telemetryInterceptor } from "../../src/api/telemetry"
import type { TrackEnv } from "../../src/analytics"
import type { Bindings } from "../../src/types"
import { devEnv, recorder } from "../helpers/track-env"

/**
 * The interceptor is the only thing standing between fifty-six procedures and a
 * dataset nobody can query, so the things worth pinning are the two that would
 * silently produce one: that a failure is recorded at all, and that it is
 * recorded under a name that groups.
 */

const call = (env: TrackEnv, next: () => Promise<unknown>, path = "/api/games") =>
  telemetryInterceptor({
    request: { url: new URL(`https://x${path}`), method: "POST" },
    context: { env: env as Bindings },
    next,
  })

/**
 * Run something with the sampling dice loaded, then put them back.
 *
 * Successes are recorded one time in ten on a deployment, so a test that just
 * calls the interceptor and asserts on the result is right nine times out of
 * ten — which is exactly what the previous version of this file was, at a
 * measured 1 failure in 30 runs. Pinning `Math.random` makes both branches
 * testable and neither of them a coin toss.
 *
 * Restored in a `finally`, because a test that leaks a stubbed `Math.random`
 * poisons every file after it — the same way `process.env.TZ = undefined`
 * leaked a timezone through this tier a fortnight ago.
 */
async function withRandom<T>(value: number, fn: () => Promise<T>): Promise<T> {
  const real = Math.random
  Math.random = () => value
  try {
    return await fn()
  } finally {
    Math.random = real
  }
}

describe("telemetryInterceptor", () => {
  it("records a success as api.served, with how long it took", async () => {
    // Not "records nothing", which is what this asserted until successes began
    // being sampled. A slow endpoint is one that *works*, so a dataset holding
    // only failures cannot answer the question latency is logged for.
    const { env, written } = recorder()
    await withRandom(0, () => call(env, async () => ({ matched: true })))
    expect(written[0]!.blobs?.slice(0, 4)).toEqual(["api.served", "", "/api/games", "POST"])
  })

  it("samples them, rather than billing for every asset fetch", async () => {
    // The reason it is not simply every request: this Worker fronts the SPA's
    // assets too, and Analytics Engine bills by data point.
    const { env, written } = recorder()
    await withRandom(0.99, () => call(env, async () => ({ matched: true })))
    expect(written).toEqual([])
  })

  it("separates a refusal from a bug", async () => {
    // The distinction the whole file exists for. An ORPCError is the system
    // working; a TypeError is a line of ours that is wrong. Under one event
    // name the handful worth fixing are buried under the thousands that are not.
    const { env, written } = recorder()
    await expect(
      call(env, () => Promise.reject(Object.assign(new Error("no"), { code: "FORBIDDEN", status: 403 }))),
    ).rejects.toThrow()
    await expect(call(env, () => Promise.reject(new TypeError("x is not a function")))).rejects.toThrow()

    expect(written[0]!.blobs).toEqual(["api.refused", "", "/api/games", "POST", "FORBIDDEN"])
    expect(written[0]!.doubles?.[1]).toBe(403)
    expect(written[1]!.blobs).toEqual(["api.threw", "", "/api/games", "POST", "TypeError"])
  })

  it("rethrows, so the caller still gets the response oRPC would have sent", async () => {
    // Telemetry observes. An interceptor that swallowed this would turn every
    // refusal into a hang.
    const boom = new Error("boom")
    await expect(call(devEnv, () => Promise.reject(boom))).rejects.toBe(boom)
  })

  it("survives having no dataset bound, which is every local run", async () => {
    await expect(call(devEnv, () => Promise.reject(new Error("x")))).rejects.toThrow()
  })
})

describe("routeShape", () => {
  it("collapses ids so failures group by procedure", () => {
    // Otherwise the dataset says "one failure on each of four hundred games"
    // rather than "four hundred failures on games".
    expect(routeShape("/api/games/gam_002/score")).toBe("/api/games/:id/score")
    expect(routeShape("/api/teams/team_017")).toBe("/api/teams/:id")
    expect(routeShape("/api/users/8f14e45fceea167a5a36dedd4bea2543")).toBe("/api/users/:id")
  })

  it("leaves real path segments alone", () => {
    expect(routeShape("/api/games/live")).toBe("/api/games/live")
    expect(routeShape("/api/moq/config")).toBe("/api/moq/config")
  })
})
