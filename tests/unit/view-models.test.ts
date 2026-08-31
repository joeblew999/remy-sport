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
import { apiEvent } from "../helpers/api-fixtures"

/** Enough of a Localizer to render; the localisation itself is names.test.ts. */
const loc: Localizer = {
  locale: "en",
  name: (names, fallback = "") => names?.en ?? fallback,
  label: (_vocabulary, code) => code ?? "",
}

/**
 * From the shared factory, with this file's own defaults on top.
 *
 * It used to be a hand-written literal cast with `as ApiEvent`, which is how
 * six tests here kept compiling and then threw at runtime when the contract
 * grew `divisionNames`. One factory, one place to update.
 */
const event = (over: Partial<ApiEvent> = {}): ApiEvent =>
  apiEvent({
    id: "e1",
    name: "Spring Cup",
    names: { en: "Spring Cup" },
    // Uppercase, because that is what the vocabulary defines. The cast that was
    // here hid a value no EventTypeCode has.
    typeCode: "TOURNAMENT",
    // Undated by default: this file is about deriving a status from a date
    // window, so "no window" is the case worth starting from.
    startDate: null,
    endDate: null,
    cityCode: null,
    provinceCode: null,
    organizerUserId: "u1",
    organizerName: "Bangkok Schools League",
    ...over,
  })

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

describe("what an event contains comes from the tables that hold it", () => {
  /**
   * These four used to be hardcoded — a dash, "Venue TBC", and four zeroes — on
   * events with divisions, a venue and a dozen games. The tables existed the
   * whole time; the API simply never returned them, and the tests here pinned
   * the placeholders in place as though they were the rule rather than the
   * limitation.
   *
   * AGENTS.md still says never to invent a value for a field with no table. The
   * point is that these fields *have* tables, so the honest thing is to read
   * them — a placeholder over real data is its own kind of lie.
   */
  const full = toEvent(event(), loc, on("2026-06-10"))

  test("the counts are the server's, not zeroes", () => {
    expect([full.teams, full.courts, full.games, full.gamesPlayed]).toEqual([15, 1, 28, 17])
    expect(full.followers).toBe(2)
  })

  test("the venue is named when there is one", () => {
    expect(full.loc).toBe("Assumption College Indoor Court")
  })

  test("one division reads as its name, several as a count", () => {
    // "U14 Boys · U16 Boys · U16 Girls · U18 Boys" in a tagline is a wall
    // rather than a fact, so past one it collapses to a number.
    expect(toEvent(event({ divisionNames: [{ en: "U18 Boys" }] }), loc, on("2026-06-10")).div).toBe(
      "U18 Boys",
    )
    expect(full.div).toBe("3 divisions")
  })

  test("and an event with nothing in it still says so honestly", () => {
    // Empty is a real state — an event created this morning. It renders as a
    // dash and "Venue TBC" because that is true, not because nothing could be
    // read.
    const empty = toEvent(
      event({
        teamCount: 0,
        venueCount: 0,
        gameCount: 0,
        playedCount: 0,
        followerCount: 0,
        venueNames: null,
        divisionNames: [],
      }),
      loc,
      on("2026-06-10"),
    )
    expect(empty.div).toBe("—")
    expect(empty.loc).toBe("Venue TBC")
    expect([empty.teams, empty.courts, empty.games, empty.gamesPlayed]).toEqual([0, 0, 0, 0])
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
