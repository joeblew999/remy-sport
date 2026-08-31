import { describe, it, expect } from "bun:test"
import { errorName } from "../../src/web/lib/report"

/**
 * The one identifying field a client error reports.
 *
 * It used to be `error.name` alone, which was enough while only the crash
 * boundary called `reportClientError` — a React render throws a real subclass.
 * It stopped being enough when unhandled rejections started arriving: a
 * rejected oRPC call is an `Error` whose constructor the bundler has minified
 * to `e`, so **every** rejection in production reported as plain "Error" and the
 * dataset could not tell a 404 from a 500 from a genuine bug.
 *
 * Measured, not assumed: the reason for the profile-page defect carried
 * `{ name: "Error", code: "NOT_FOUND", status: 404 }`.
 *
 * Everything here must stay low cardinality. `message` and `data` are never
 * recorded — a message is unbounded and can name a person, which is why the
 * payload is "deliberately not much".
 */

describe("errorName", () => {
  it("prefers a real subclass, which survives minification", () => {
    expect(errorName(new TypeError("x"))).toBe("TypeError")
    expect(errorName(new RangeError("x"))).toBe("RangeError")
  })

  it("falls back to the error code when the name is the useless generic", () => {
    // The measured shape of a rejected oRPC call.
    const rejected = Object.assign(new Error("Not Found"), { code: "NOT_FOUND", status: 404 })
    expect(errorName(rejected)).toBe("NOT_FOUND")
  })

  it("falls back to the status when there is no code either", () => {
    expect(errorName(Object.assign(new Error("boom"), { status: 503 }))).toBe("HTTP_503")
  })

  it("still says Error when there is nothing better", () => {
    expect(errorName(new Error("plain"))).toBe("Error")
    expect(errorName({})).toBe("Error")
    expect(errorName(null)).toBe("Error")
  })

  it("names a rejection that carried no error at all", () => {
    // `Promise.reject("nope")` is its own class of bug and worth seeing. The
    // value is not recorded — it is unbounded and could be anything.
    expect(errorName("nope")).toBe("non-error:string")
    expect(errorName(42)).toBe("non-error:number")
    expect(errorName(undefined)).toBe("non-error:undefined")
  })

  it("never emits an unbounded value", () => {
    // Cardinality is the whole constraint: a name derived from user input would
    // shard the dataset and could carry a person's details into telemetry.
    const long = Object.assign(new Error("x"), { code: "C".repeat(500) })
    expect(errorName(long).length).toBeLessThanOrEqual(60)
    const named = Object.assign(new Error("x"), { name: "N".repeat(500) })
    expect(errorName(named).length).toBeLessThanOrEqual(60)
  })

  it("does not leak the message, which may name a person", () => {
    const e = Object.assign(new Error("User ada@example.com was not found"), {
      code: "UNKNOWN_USER",
    })
    expect(errorName(e)).toBe("UNKNOWN_USER")
    expect(errorName(e)).not.toContain("@")
  })
})
