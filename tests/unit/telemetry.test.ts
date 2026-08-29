import { describe, expect, it } from "vitest"
import { routeShape, telemetryInterceptor } from "../../src/api/telemetry"

/**
 * The interceptor is the only thing standing between fifty-six procedures and a
 * dataset nobody can query, so the things worth pinning are the two that would
 * silently produce one: that a failure is recorded at all, and that it is
 * recorded under a name that groups.
 */

type Point = { blobs?: unknown[]; doubles?: unknown[] }

const recorder = () => {
  const written: Point[] = []
  // `MAIL_TRANSPORT: "cloudflare"` marks this as a deployment. Without it the
  // event is kept in the local ring instead of written, and every assertion
  // about `written` passes vacuously.
  const env = {
    MAIL_TRANSPORT: "cloudflare",
    ANALYTICS: { writeDataPoint: (p: Point) => void written.push(p) },
  }
  return { written, env: env as never }
}

const call = (env: unknown, next: () => Promise<unknown>, path = "/api/games") =>
  telemetryInterceptor({
    request: { url: new URL(`https://x${path}`), method: "POST" },
    context: { env: env as never },
    next,
  })

describe("telemetryInterceptor", () => {
  it("records nothing when the call succeeds", async () => {
    // Failures only: a row per request would bill for every asset fetch too.
    const { env, written } = recorder()
    await call(env, async () => ({ matched: true }))
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
    await expect(call({}, () => Promise.reject(boom))).rejects.toBe(boom)
  })

  it("survives having no dataset bound, which is every local run", async () => {
    await expect(call({}, () => Promise.reject(new Error("x")))).rejects.toThrow()
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
