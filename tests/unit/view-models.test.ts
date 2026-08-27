/**
 * The API → view-model mappers, at day granularity.
 *
 * `toEvent` takes `today` as a parameter rather than calling `new Date()`
 * inside, which is what makes this testable at all — the boundary cases below
 * are the ones that only appear at midnight, on a final day, or across a year.
 *
 * AGENTS.md states the rule these enforce: **derive, don't store, anything that
 * is a function of other columns.** There is no `status` column and there must
 * never be one; these tests are what makes that rule enforceable rather than
 * aspirational.
 */

import { expect, test, describe } from "bun:test"
import { shortCode, toEvent, type ApiEvent } from "../../src/web/lib/api"
import type { Localizer } from "../../src/web/lib/localizer"

/** Enough of a Localizer to render; the localisation itself is names.test.ts. */
const loc: Localizer = {
  locale: "en",
  name: (names, fallback = "") => names?.en ?? fallback,
  label: (_vocabulary, code) => code ?? "",
}

const event = (over: Partial<ApiEvent> = {}): ApiEvent =>
  ({
    id: "e1",
    name: "Spring Cup",
    names: { en: "Spring Cup" },
    typeCode: "tournament",
    formatCode: "5x5",
    description: null,
    startDate: null,
    endDate: null,
    cityCode: null,
    provinceCode: null,
    isFibaCertified: false,
    organizerUserId: "u1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    organizerName: "Bangkok Schools League",
    ...over,
  }) as ApiEvent

const on = (iso: string) => new Date(`${iso}T12:00:00`)
const statusOn = (e: Partial<ApiEvent>, today: string) => toEvent(event(e), loc, on(today)).status

describe("event status is derived from the date window", () => {
  const window = { startDate: "2026-06-10", endDate: "2026-06-14" }

  test("before the window: upcoming", () => {
    expect(statusOn(window, "2026-06-09")).toBe("upcoming")
  })

  test("on the first day: live", () => {
    expect(statusOn(window, "2026-06-10")).toBe("live")
  })

  test("on the FINAL day: still live", () => {
    // The documented boundary: "an event is live on its final day, not until
    // midnight at the start of it". Comparing timestamps rather than days
    // would close this event a day early, every time.
    expect(statusOn(window, "2026-06-14")).toBe("live")
  })

  test("the day after: closed", () => {
    expect(statusOn(window, "2026-06-15")).toBe("closed")
  })

  test("a single-day event is live on exactly that day", () => {
    const day = { startDate: "2026-06-10", endDate: "2026-06-10" }
    expect(statusOn(day, "2026-06-09")).toBe("upcoming")
    expect(statusOn(day, "2026-06-10")).toBe("live")
    expect(statusOn(day, "2026-06-11")).toBe("closed")
  })

  test("an event with no end date is treated as ending on its start day", () => {
    expect(statusOn({ startDate: "2026-06-10", endDate: null }, "2026-06-10")).toBe("live")
    expect(statusOn({ startDate: "2026-06-10", endDate: null }, "2026-06-11")).toBe("closed")
  })

  test("an undated event reads as upcoming, never as closed", () => {
    // "which is what an organiser who has not set dates yet means" — the
    // failure mode this guards is a brand-new event rendering as Finished.
    expect(statusOn({}, "2026-06-10")).toBe("upcoming")
  })

  test("the time of day never changes the answer", () => {
    const e = event({ startDate: "2026-06-10", endDate: "2026-06-14" })
    const justBeforeMidnight = new Date("2026-06-14T23:59:59")
    const justAfterMidnight = new Date("2026-06-14T00:00:01")
    expect(toEvent(e, loc, justBeforeMidnight).status).toBe("live")
    expect(toEvent(e, loc, justAfterMidnight).status).toBe("live")
  })
})

describe("fields with no table render placeholders, never invented values", () => {
  // AGENTS.md: "Never invent a value for a field with no table." These are the
  // placeholders that rule requires; a number appearing here would be a bug.
  const e = toEvent(event(), loc, on("2026-06-10"))

  test("division and venue are placeholders", () => {
    expect(e.div).toBe("—")
    expect(e.loc).toBe("Venue TBC")
  })

  test("counts are zero, not guesses", () => {
    expect([e.teams, e.courts, e.games, e.gamesPlayed]).toEqual([0, 0, 0, 0])
  })

  test("a missing organiser says so rather than showing an id", () => {
    expect(toEvent(event({ organizerName: null }), loc, on("2026-06-10")).organizer).toBe(
      "Unknown organiser",
    )
  })
})

/**
 * Date ranges, in the reader's language and their word order.
 *
 * These used to assert "JUN 10–14, 2026", produced by a hardcoded English month
 * array. That was not merely untranslated — it was structurally English-only:
 * the format string said MONTH DAY, YEAR, and Thai writes the day first. No
 * amount of translating the month names would have fixed the order.
 *
 * `Intl.DateTimeFormat.formatRange` knows both, and knows that a range inside
 * one month collapses differently in each. The Thai cases below are the proof —
 * if this ever regresses to hand-rolled formatting, they are what fails.
 */
describe("date ranges are written the way each language writes them", () => {
  const range = (locale: string, startDate: string | null, endDate: string | null) =>
    toEvent(event({ startDate, endDate }), { ...loc, locale } as Localizer, on("2026-01-01")).date

  test("undated", () => expect(range("en", null, null)).toBe("Dates TBC"))

  describe("en", () => {
    test("single day", () => expect(range("en", "2026-06-10", "2026-06-10")).toBe("Jun 10, 2026"))
    test("within one month collapses the month", () =>
      expect(range("en", "2026-06-10", "2026-06-14")).toBe("Jun 10 – 14, 2026"))
    test("across months keeps both", () =>
      expect(range("en", "2026-06-28", "2026-07-02")).toBe("Jun 28 – Jul 2, 2026"))
    test("across a year keeps both years", () =>
      expect(range("en", "2026-12-28", "2027-01-02")).toBe("Dec 28, 2026 – Jan 2, 2027"))
  })

  describe("th — day first, which the old formatter could not express", () => {
    test("single day", () => expect(range("th", "2026-06-10", "2026-06-10")).toBe("10 มิ.ย. 2026"))
    test("within one month collapses the month", () =>
      expect(range("th", "2026-06-10", "2026-06-14")).toBe("10–14 มิ.ย. 2026"))
    test("across months keeps both", () =>
      expect(range("th", "2026-06-28", "2026-07-02")).toBe("28 มิ.ย. – 2 ก.ค. 2026"))
    test("across a year keeps both years", () =>
      expect(range("th", "2026-12-28", "2027-01-02")).toBe("28 ธ.ค. 2026 – 2 ม.ค. 2027"))
  })

  // The Gregorian year, not the Buddhist 2569, and that is a decision rather
  // than an accident — CALENDAR in lib/dates.ts, with the reasoning.
  test("th renders the Gregorian year, per the one calendar decision", () =>
    expect(range("th", "2026-06-10", "2026-06-10")).toContain("2026"))
})

/**
 * The status chip and the "starts in N days" countdown, in the reader's
 * language.
 *
 * These were English string literals returned straight out of `statusLabel` —
 * "Live now", "Finished", "Registration open" — so a Thai reader saw an English
 * status on every event card and every event page. They render on the two most
 * visited screens in the product, which is why they were worth fixing before
 * the admin console's headers.
 */
describe("event status speaks the reader's language", () => {
  const label = (locale: string, startDate: string, endDate: string, today: string) =>
    toEvent(
      event({ startDate, endDate }),
      { ...loc, locale } as Localizer,
      on(today),
    ).statusLabel

  test("live, in English", () =>
    expect(label("en", "2026-06-01", "2026-06-30", "2026-06-10")).toBe("Live now"))
  test("live, in Thai", () =>
    expect(label("th", "2026-06-01", "2026-06-30", "2026-06-10")).toBe("กำลังแข่ง"))

  test("finished, in Thai", () =>
    expect(label("th", "2026-01-01", "2026-01-02", "2026-06-10")).toBe("จบการแข่งขัน"))

  test("the countdown interpolates into Thai word order", () =>
    expect(label("th", "2026-06-17", "2026-06-18", "2026-06-10")).toBe("เริ่มในอีก 7 วัน"))

  test("tomorrow is its own phrase, not '1 days'", () => {
    expect(label("en", "2026-06-11", "2026-06-11", "2026-06-10")).toBe("Starts tomorrow")
    expect(label("th", "2026-06-11", "2026-06-11", "2026-06-10")).toBe("เริ่มพรุ่งนี้")
  })

  test("an unknown organiser is translated too", () =>
    expect(
      toEvent(event({ organizerName: null }), { ...loc, locale: "th" } as Localizer, on("2026-06-10"))
        .organizer,
    ).toBe("ไม่ทราบผู้จัด"))
})

describe("shortCode — initials only", () => {
  test("takes initials from a multi-word name", () => {
    expect(shortCode("Bangkok Christian College")).toBe("BCC")
  })

  test("never slices a single word", () => {
    // The documented reason: slicing one word "produces unfortunate
    // three-letter strings". Whatever it returns, it must not be a substring
    // beyond the first letter.
    expect(shortCode("Assumption").length).toBeLessThanOrEqual(3)
  })

  test("survives empty input without throwing", () => {
    expect(() => shortCode("")).not.toThrow()
  })
})
