import { describe, expect, it } from "vitest"
import {
  EVENTS,
  blobColumn,
  doubleColumn,
  isEventName,
  recent,
  track,
  trackDynamic,
  type EventName,
  type EventSpec,
} from "../../src/analytics"

/**
 * Two things are being protected here, and they are different in kind.
 *
 * **Telemetry must not break the thing it measures.** No binding, a write that
 * throws, a field nobody filled in — the happy path is one line of the
 * implementation and these used to be able to take a request down.
 *
 * **The catalogue must stay self-consistent.** Analytics Engine gives no help
 * at all: twenty anonymous string columns, no schema, no error for writing the
 * wrong one. The tests at the bottom are the only thing standing between a
 * renamed field and a report that reads a different column while still
 * returning strings.
 */

type Point = { blobs?: unknown[]; doubles?: unknown[]; indexes?: unknown[] }

/**
 * An env that behaves like a deployment.
 *
 * `MAIL_TRANSPORT: "cloudflare"` is load-bearing, not decoration: it is this
 * codebase's "this is not a dev server" flag, and without it `track` keeps the
 * event in the local ring and writes nothing — which is correct behaviour and
 * makes every assertion about `written` silently vacuous.
 */
const recorder = () => {
  const written: Point[] = []
  return {
    written,
    env: {
      MAIL_TRANSPORT: "cloudflare",
      ANALYTICS: { writeDataPoint: (p: Point) => void written.push(p) },
    } as never,
  }
}

/** A dev server: no dataset to write to, so events are kept in memory. */
const devEnv = {} as never

describe("track", () => {
  it("never throws when the dataset is not bound", () => {
    // `wrangler dev` and every worker test run without it, so this is the
    // ordinary case rather than an edge one.
    expect(() => track({ MAIL_TRANSPORT: "cloudflare" } as never, "moq.session", {})).not.toThrow()
  })

  it("swallows a rejected write rather than failing the request", () => {
    const env = {
      MAIL_TRANSPORT: "cloudflare",
      ANALYTICS: {
        writeDataPoint: () => {
          throw new Error("dataset unavailable")
        },
      },
    } as never
    expect(() => track(env, "moq.session", {})).not.toThrow()
  })

  it("writes the event first and the country second, for every caller", () => {
    // The bug this design replaced: the browser beacon prepended country onto
    // its own fields and the server-side calls did not, so the third column
    // meant "country" for a video session and "route" for an API failure. Every
    // query reading both was wrong by one, silently, because a shifted string
    // is still a string.
    const { env, written } = recorder()
    track(env, "api.refused", { route: "/api/games", method: "POST", code: "FORBIDDEN" }, "TH")
    track(env, "push.sent", { host: "web.push.apple.com", status: "201" })

    expect(written[0]!.blobs).toEqual(["api.refused", "TH", "/api/games", "POST", "FORBIDDEN"])
    // Blank rather than absent, so a caller with no country does not shift the
    // fields of one that has it.
    expect(written[1]!.blobs).toEqual(["push.sent", "", "web.push.apple.com", "201", ""])
  })

  it("orders fields by the catalogue, not by the object literal", () => {
    // The whole point of naming them: a caller writing its fields in a
    // different order must produce an identical row.
    const { env, written } = recorder()
    track(env, "api.refused", { code: "NOT_FOUND", method: "GET", route: "/api/teams" })
    expect(written[0]!.blobs).toEqual(["api.refused", "", "/api/teams", "GET", "NOT_FOUND"])
  })

  it("writes a blank for a missing field instead of shifting the columns", () => {
    // Analytics Engine matches by position, so a dropped entry moves every later
    // field one to the left — and the rows most worth reading are exactly the
    // ones missing fields, because they are the ones that went wrong.
    const { env, written } = recorder()
    track(env, "moq.session", { role: "watch", transport: "websocket", seconds: 42 })
    expect(written[0]!.blobs).toEqual(["moq.session", "", "watch", "", "websocket", ""])
    expect(written[0]!.doubles).toEqual([0, 42])
  })

  it("indexes by the event, which is the sampling key", () => {
    const { env, written } = recorder()
    track(env, "broadcast.started", { gameId: "gam_002" })
    expect(written[0]!.indexes).toEqual(["broadcast.started"])
  })
})

describe("trackDynamic", () => {
  it("writes the same row as track, for a name known only at runtime", () => {
    // The browser beacon's path. It exists so that route does not need a cast:
    // the event name is validated against the catalogue at runtime, and no type
    // can express that, so the signature says so honestly instead.
    const { env, written } = recorder()
    track(env, "push.sent", { host: "fcm.googleapis.com", status: "200", tag: "score", ok: 1 })
    trackDynamic(
      env,
      "push.sent",
      { host: "fcm.googleapis.com", status: "200", tag: "score", ok: 1 },
      undefined,
    )
    expect(written[1]).toEqual(written[0])
  })
})

describe("isEventName", () => {
  it("admits the catalogue and nothing else", () => {
    // The beacon is unauthenticated by design, so this is the only thing
    // stopping anyone filling the dataset with event names nobody declared.
    expect(isEventName("moq.session")).toBe(true)
    expect(isEventName("moq.sessions")).toBe(false)
    expect(isEventName("")).toBe(false)
    expect(isEventName(null)).toBe(false)
    // Not an own property of the catalogue, whatever `in` thinks of prototypes.
    expect(isEventName("toString")).toBe(false)
  })
})

describe("the local ring", () => {
  it("keeps events when there is no dataset, normalised as the real write would", () => {
    // Without this the entire local loop is invisible: wrangler dev binds
    // Analytics Engine and discards every write, so the only way to see a row
    // was to deploy.
    const before = recent().events.length
    track(devEnv, "broadcast.ended", { gameId: "gam_009", seconds: 61 })
    const kept = recent().events.at(-1)!
    expect(recent().events.length).toBe(before + 1)
    expect(kept.event).toBe("broadcast.ended")
    expect(kept.fields).toEqual({ gameId: "gam_009", seconds: 61 })
    // The collection window, so an empty report can be told apart from a
    // worker that was recycled a moment ago.
    expect(Date.parse(recent().since)).not.toBeNaN()
  })
})

describe("the catalogue", () => {
  const entries = Object.entries(EVENTS) as [EventName, EventSpec][]

  it("declares dimensions that are really fields of the event", () => {
    // Also enforced by `defineEvent`'s types; asserted here because the failure
    // mode is a report that groups by a column of empty strings — which looks
    // like "no data" rather than like a mistake.
    for (const [name, spec] of entries) {
      for (const d of spec.dimensions) {
        expect(spec.blobs, `${name} groups by ${d}`).toContain(d)
      }
    }
  })

  it("never names the same field twice", () => {
    // A duplicate would write two columns and read one, and the second would be
    // permanently invisible.
    for (const [name, spec] of entries) {
      const all = [...spec.blobs, ...spec.doubles]
      expect(new Set(all).size, `${name} has a repeated field`).toBe(all.length)
    }
  })

  it("fits the twenty columns Analytics Engine actually has", () => {
    // Silently truncated otherwise. Two blobs are spent on event and country.
    for (const [name, spec] of entries) {
      expect(spec.blobs.length + 2, `${name} blobs`).toBeLessThanOrEqual(20)
      expect(spec.doubles.length, `${name} doubles`).toBeLessThanOrEqual(20)
    }
  })

  it("puts a field's first column after the two fixed ones", () => {
    // The arithmetic both the writer and the report SQL depend on. If this is
    // wrong, every generated query is wrong in exactly the way that started all
    // of this.
    expect(blobColumn(0)).toBe("blob3")
    expect(blobColumn(1)).toBe("blob4")
    expect(doubleColumn(0)).toBe("double1")
  })

  it("agrees with what the writer actually emits", () => {
    // The end-to-end version of the above: for every event in the catalogue,
    // the column the report would read is the column the writer wrote. This is
    // the assertion that makes "the two halves cannot disagree" true rather
    // than merely intended.
    for (const [name, spec] of entries) {
      const { env, written } = recorder()
      const fields: Record<string, string | number> = {}
      spec.blobs.forEach((b, i) => (fields[b] = `b${i}`))
      spec.doubles.forEach((d, i) => (fields[d] = i + 1))
      trackDynamic(env, name, fields, "TH")

      const blobs = written[0]!.blobs as string[]
      spec.blobs.forEach((b, i) => {
        const column = Number(blobColumn(i).replace("blob", ""))
        expect(blobs[column - 1], `${name}.${b} → ${blobColumn(i)}`).toBe(`b${i}`)
      })
      const doubles = written[0]!.doubles as number[]
      spec.doubles.forEach((d, i) => {
        const column = Number(doubleColumn(i).replace("double", ""))
        expect(doubles[column - 1], `${name}.${d} → ${doubleColumn(i)}`).toBe(i + 1)
      })
    }
  })
})
