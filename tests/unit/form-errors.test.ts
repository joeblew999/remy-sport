import { describe, expect, it, test } from "bun:test"
import { ORPCError } from "@orpc/client"
import { formErrors } from "../../src/web/lib/form-errors"
import { m } from "../../src/web/lib/i18n"

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

/**
 * The convention that replaced a hand-written table.
 *
 * `TEAM_PLAYS_ITSELF` reads `err_team_plays_itself`. Adding an error used to
 * touch four files and write the same English twice — once as the code's
 * `message`, once in `en.json`. `mise run check:messages` is what stops a code
 * shipping without a sentence now that no table declares them.
 */
describe("codes map to messages by convention", () => {
  it("renders a code with no data", () => {
    const e = new ORPCError("TEAM_PLAYS_ITSELF", { defined: true, status: 400 })
    expect(formErrors(e).form).toBe("A team cannot play itself.")
  })

  it("renders a code whose message names the data it was sent", () => {
    const e = new ORPCError("DIVISION_MISMATCH", {
      defined: true,
      status: 400,
      data: { teamAgeGroup: "U18", teamGender: "F", divisionAgeGroup: "U16", divisionGender: "M" },
    })
    expect(formErrors(e).form).toBe("This team is U18 F; that division is U16 M.")
  })

  it("survives a code that carries no data at all", () => {
    // `data` undefined rather than {} — the shape a no-data error arrives in.
    const e = new ORPCError("UNKNOWN_USER", { defined: true, status: 404 })
    expect(formErrors(e).form).toBe("No account has that email address.")
  })
})

/**
 * The Worker's own English must not reach the screen.
 *
 * `throw new ORPCError("NOT_FOUND", { message: "Not found" })` appears a dozen
 * times in src/api, and every one of them used to render verbatim — so a Thai
 * reader hitting a missing row read "Not found" in English.
 *
 * Localising those dozen strings would have been the wrong fix: the thirteenth
 * would leak again. The client renders the message for the error's CODE
 * instead, which closes it for every throw site at once, including ones not
 * written yet. These tests are what stop `error.message` creeping back.
 */
describe("a raw server message never renders", () => {
  const raw = (code: string, message: string) => new ORPCError(code, { message })

  test("a 404 renders the local message, not the server's", () => {
    const { form } = formErrors(raw("NOT_FOUND", "Not found"))
    expect(form).not.toBe("Not found")
    expect(form).toBe(m.err_not_found())
  })

  test("a 403 likewise", () => {
    const { form } = formErrors(raw("FORBIDDEN", "Forbidden"))
    expect(form).not.toBe("Forbidden")
    expect(form).toBe(m.err_forbidden())
  })

  test("a 401 likewise", () => {
    expect(formErrors(raw("UNAUTHORIZED", "Unauthorized")).form).toBe(m.err_unauthorized())
  })

  test("in Thai, which is the whole point", () => {
    const { form } = formErrors(raw("NOT_FOUND", "Not found"))
    // The renderer follows getLocale(); assert the Thai string is reachable and
    // is not the server's English either way.
    expect(m.err_not_found({}, { locale: "th" })).not.toBe("Not found")
    expect(form).not.toContain("Not found")
  })

  test("a plain Error with no code still shows something", () => {
    // A network failure: the message is the browser's, not the Worker's, and
    // showing it beats showing nothing.
    expect(formErrors(new Error("Failed to fetch")).form).toBe("Failed to fetch")
  })
})
