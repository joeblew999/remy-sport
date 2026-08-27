import { describe, expect, it } from "bun:test"
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
