import { describe, expect, it } from "bun:test"
import { ORPCError } from "@orpc/client"
import { formErrors } from "../../src/web/lib/form-errors"

/**
 * The guarantee: a refusal always renders somewhere.
 *
 * The version this replaced could show nothing at all — a mistyped path
 * returned undefined and the whole-form fallback stayed quiet because issues
 * existed. The reader clicked Save and the screen did not change.
 */
const validation = {
  message: "Input validation failed",
  data: { issues: [{ path: ["email"], message: "Invalid email address" }] },
}
const refusal = { message: "Unknown user" }

describe("form errors", () => {
  it("puts a validation message on the field that owns it", () => {
    const e = formErrors(validation, ["email"])
    expect(e.field("email")).toBe("Invalid email address")
    expect(e.form, "claimed, so nothing is left over").toBeNull()
  })

  it("puts a refusal with no field at form level", () => {
    const e = formErrors(refusal, ["email"])
    expect(e.field("email")).toBeUndefined()
    expect(e.form).toBe("Unknown user")
  })

  it("NEVER swallows an issue whose path the form got wrong", () => {
    // The bug. "emial" matches nothing, and the old shape rendered silence.
    const e = formErrors(validation, ["emial"])
    expect(e.field("emial")).toBeUndefined()
    expect(e.form, "surfaced at form level rather than lost").toBe("Invalid email address")
  })

  it("surfaces an issue for a field the form does not render at all", () => {
    // A schema grows a field before the form does.
    const e = formErrors(validation, [])
    expect(e.form).toBe("Invalid email address")
  })

  it("says a shared message once, not once per field", () => {
    const both = {
      message: "Input validation failed",
      data: {
        issues: [
          { path: ["homeScore"], message: "Give both scores or neither" },
          { path: ["awayScore"], message: "Give both scores or neither" },
        ],
      },
    }
    expect(formErrors(both, []).form).toBe("Give both scores or neither")
  })

  it("is quiet when there is no error", () => {
    const e = formErrors(null, ["email"])
    expect(e.field("email")).toBeUndefined()
    expect(e.form).toBeNull()
  })
})

/**
 * A named refusal renders in the reader's language, not the server's.
 *
 * This is the point of the whole change: the API used to throw English prose
 * and the page printed it, so a Thai coach on a fully Thai page read "A team
 * cannot play itself" in English.
 */
describe("defined errors", () => {
  /**
   * A real ORPCError, not a plain object shaped like one.
   *
   * `isDefinedError` is `error instanceof ORPCError && error.defined`, so a
   * fabricated literal is silently *not* a defined error and every assertion
   * below would pass for the wrong reason — it would read the `message` field
   * and look right. The oRPC client rebuilds real instances from the wire, so
   * this is what a page actually receives.
   */
  const defined = new ORPCError("TEAM_PLAYS_ITSELF", {
    defined: true,
    status: 400,
    message: "A team cannot play itself",
  })

  it("renders the code's own message, not the server's sentence", () => {
    const e = formErrors(defined)
    // The English message here is coincidental — it is the paraglide one, and
    // it is Thai on a Thai page. What matters is that it did not come from the
    // `message` field above.
    expect(e.form).toBe("A team cannot play itself.")
    expect(e.form, "the server's sentence has no full stop").not.toBe(defined.message)
  })

  it("uses the facts the server sent, so the sentence can be translated", () => {
    const mismatch = new ORPCError("DIVISION_MISMATCH", {
      defined: true,
      status: 400,
      message: "That team does not match the division it was entered into",
      data: {
        teamAgeGroup: "U18", teamGender: "F",
        divisionAgeGroup: "U16", divisionGender: "M",
      },
    })
    expect(formErrors(mismatch).form).toBe("This team is U18 F; that division is U16 M.")
  })

  it("falls back to the server's message for a code it does not know", () => {
    // A client running against a newer Worker. English beats blank.
    const future = new ORPCError("SOMETHING_NEW", { defined: true, status: 400, message: "Nope" })
    expect(formErrors(future).form).toBe("Nope")
  })

  it("leaves an undefined error alone", () => {
    expect(formErrors({ message: "Unauthorized" }).form).toBe("Unauthorized")
  })
})
