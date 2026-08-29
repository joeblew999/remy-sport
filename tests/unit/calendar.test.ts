import { describe, expect, it } from "vitest"
import { toICS } from "../../src/web/lib/calendar"

/**
 * A calendar file is written once and read by software nobody controls, so the
 * failures are all silent: an entry a day out, a truncated title, a file that
 * simply will not import. None of them raise anything.
 */
const base = { id: "evt_002", title: "Bangkok Schools League", startDate: "2026-05-01", endDate: "2026-05-03" }

describe("toICS", () => {
  it("ends the day after, because DTEND is exclusive", () => {
    // The classic off-by-one. An event on the 1st to the 3rd with DTEND 0503
    // shows in every calendar as ending on the 2nd.
    const ics = toICS(base)!
    expect(ics).toContain("DTSTART;VALUE=DATE:20260501")
    expect(ics).toContain("DTEND;VALUE=DATE:20260504")
  })

  it("treats a single-day event as one day, not zero", () => {
    const ics = toICS({ ...base, endDate: null })!
    expect(ics).toContain("DTSTART;VALUE=DATE:20260501")
    expect(ics).toContain("DTEND;VALUE=DATE:20260502")
  })

  it("crosses a month boundary", () => {
    const ics = toICS({ ...base, startDate: "2026-05-31", endDate: "2026-05-31" })!
    expect(ics).toContain("DTEND;VALUE=DATE:20260601")
  })

  it("returns null when no date is fixed, rather than inventing one", () => {
    // An event can exist before its dates are set. A file with today's date in
    // it would put a wrong entry in somebody's diary, which is worse than no
    // button at all.
    expect(toICS({ ...base, startDate: null })).toBeNull()
  })

  it("escapes the characters RFC 5545 reserves", () => {
    // A comma in a school's name would otherwise split one field into two, and
    // the entry arrives with a truncated title rather than an error.
    const ics = toICS({ ...base, title: "Assumption, Bangkok; U18" })!
    // Written with String.raw so the assertion says what the file says: a
    // backslash before each reserved character. A plain literal collapses `\;`
    // to `;` and the test then checks for the unescaped form it exists to reject.
    expect(ics).toContain(String.raw`SUMMARY:Assumption\, Bangkok\; U18`)
  })

  it("uses CRLF, which is what makes a file importable at all", () => {
    const ics = toICS(base)!
    expect(ics).toContain("\r\n")
    expect(ics.split("\r\n").filter((l) => l.endsWith("\n"))).toHaveLength(0)
  })

  it("folds a long line instead of letting a client truncate it", () => {
    const long = "ก".repeat(200)
    const ics = toICS({ ...base, title: long })!
    for (const line of ics.split("\r\n")) expect(line.length).toBeLessThanOrEqual(74)
    // And the whole title survives the folding.
    expect(ics.replace(/\r\n /g, "")).toContain(long)
  })

  it("gives an event a stable id, so adding it twice updates rather than duplicates", () => {
    expect(toICS(base)!).toContain("UID:evt_002@remy-sport")
    expect(toICS(base)!).toContain("UID:evt_002@remy-sport")
  })

  it("omits a location it was not given, rather than writing an empty one", () => {
    expect(toICS(base)!).not.toContain("LOCATION:")
    expect(toICS({ ...base, location: "Assumption Indoor Court" })!).toContain(
      "LOCATION:Assumption Indoor Court",
    )
  })
})
