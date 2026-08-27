/**
 * The two failure modes of `lib/dates.ts`, which pull in opposite directions.
 *
 * A bad *locale* must degrade — it runs while rendering a list, and one
 * mis-formatted line beats a blank page.
 *
 * A bad *timezone* must throw — the caller answers it with UTC. Falling back
 * silently would render a confident wrong time on the machine's own clock,
 * which is how a coach turns up an hour late.
 *
 * Both go through the same `Intl.DateTimeFormat` constructor and the same
 * try/catch, so it is one line of code away from getting this backwards. It
 * already was, briefly, while this file was being written.
 */
import { describe, test, expect } from "bun:test"
import { formatDayRange, formatMonthShort, formatTimeOn, tag, CALENDAR } from "../../src/web/lib/dates"

const AUG_1 = new Date(2026, 7, 1)
const AT = new Date("2026-08-27T03:00:00Z")

describe("a broken locale degrades rather than blanking the page", () => {
  test("a malformed tag still returns a string", () => {
    // What an undefined `Localizer.locale` produced: "undefined-u-ca-gregory".
    expect(formatDayRange("undefined", AUG_1, null)).toBeString()
    expect(formatMonthShort("!!not a tag!!", AUG_1)).toBeString()
  })

  test("a well-formed but unsupported locale never throws in the first place", () => {
    expect(() => formatDayRange("yo-NG", AUG_1, null)).not.toThrow()
  })
})

describe("a broken timezone throws, so the caller can say UTC", () => {
  test("an unknown IANA name is not swallowed", () => {
    expect(() => formatTimeOn("en", AT, "Mars/Olympus_Mons")).toThrow()
  })

  test("and is still not swallowed when the locale is ALSO broken", () => {
    // The regression that matters: the locale fallback retries the constructor,
    // and if that retry dropped `options` the bad zone would vanish with it.
    expect(() => formatTimeOn("undefined", AT, "Mars/Olympus_Mons")).toThrow()
  })

  test("a real zone is honoured and not replaced by the machine's", () => {
    // 03:00 UTC is +07 in Bangkok and +10 in Melbourne. `en` renders a 12-hour
    // clock, so the assertion is on the rendered string rather than on 13:00 —
    // the point is that the same instant reads as two different times.
    expect(formatTimeOn("en", AT, "Asia/Bangkok")).toContain("10:00 AM")
    expect(formatTimeOn("en", AT, "Australia/Melbourne")).toContain("01:00 PM")
  })
})

describe("the calendar is one decision", () => {
  test("every locale is tagged with it", () => {
    expect(tag("th")).toBe(`th-u-ca-${CALENDAR}`)
  })

  test("so Thai renders the Gregorian year, not the Buddhist 2569", () => {
    // Changing CALENDAR to "buddhist" should flip this and every other date on
    // the site together. That is the property being pinned, not the value.
    expect(formatDayRange("th", AUG_1, null)).toContain("2026")
  })
})
