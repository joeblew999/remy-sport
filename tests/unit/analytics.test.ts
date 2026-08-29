import { describe, expect, it } from "vitest"
import { track } from "../../src/analytics"

/**
 * Telemetry must not be able to break the thing it measures.
 *
 * Every assertion here is about failure: no binding, a write that throws, a
 * field nobody filled in. The happy path is one line of the implementation; the
 * reason this file exists is that the other three used to be able to take a
 * request down with them.
 */

type Point = { blobs?: unknown[]; doubles?: unknown[]; indexes?: unknown[] }

const recorder = () => {
  const written: Point[] = []
  return {
    written,
    env: { ANALYTICS: { writeDataPoint: (p: Point) => void written.push(p) } } as never,
  }
}

describe("track", () => {
  it("does nothing, quietly, when the dataset is not bound", () => {
    // `wrangler dev` and every worker test run without it, so this is the
    // ordinary case rather than an edge one.
    expect(() => track({} as never, { event: "moq.session" })).not.toThrow()
  })

  it("swallows a rejected write rather than failing the request", () => {
    const env = {
      ANALYTICS: {
        writeDataPoint: () => {
          throw new Error("dataset unavailable")
        },
      },
    } as never
    expect(() => track(env, { event: "moq.session" })).not.toThrow()
  })

  it("puts the event first, so every query can filter on it", () => {
    const { env, written } = recorder()
    track(env, { event: "moq.session", blobs: ["TH", "fallback"] })
    expect(written[0]!.blobs![0]).toBe("moq.session")
    expect(written[0]!.blobs).toEqual(["moq.session", "TH", "fallback"])
  })

  it("writes a blank for a missing field instead of shifting the columns", () => {
    // The failure this guards: Analytics Engine matches blobs by position, so a
    // dropped entry moves every later field into the wrong column. A session
    // that fell back to WebSocket reports no transport stats at all, and those
    // are the sessions most worth reading.
    const { env, written } = recorder()
    track(env, {
      event: "moq.session",
      blobs: ["TH", undefined, "reconnected"],
      doubles: [undefined, 42],
    })
    expect(written[0]!.blobs).toEqual(["moq.session", "TH", "", "reconnected"])
    expect(written[0]!.doubles).toEqual([0, 42])
  })

  it("defaults the sampling index to the event", () => {
    const { env, written } = recorder()
    track(env, { event: "signin.refused" })
    expect(written[0]!.indexes).toEqual(["signin.refused"])
  })
})
