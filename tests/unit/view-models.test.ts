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

describe("date ranges read as a human would write them", () => {
  const range = (startDate: string | null, endDate: string | null) =>
    toEvent(event({ startDate, endDate }), loc, on("2026-01-01")).date

  test("undated", () => expect(range(null, null)).toBe("Dates TBC"))
  test("single day", () => expect(range("2026-06-10", "2026-06-10")).toBe("JUN 10, 2026"))
  test("within one month collapses the month", () =>
    expect(range("2026-06-10", "2026-06-14")).toBe("JUN 10–14, 2026"))
  test("across months keeps both", () =>
    expect(range("2026-06-28", "2026-07-02")).toBe("JUN 28 – JUL 2, 2026"))
  test("across a year keeps both years", () =>
    expect(range("2026-12-28", "2027-01-02")).toBe("DEC 28, 2026 – JAN 2, 2027"))
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
