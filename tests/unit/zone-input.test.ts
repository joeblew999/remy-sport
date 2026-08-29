import { describe, expect, it } from "vitest"
import { toLocalInput, fromLocalInput } from "../../src/web/lib/dates"

/**
 * Editing a time that is stored in UTC and read on a named clock.
 *
 * The bug these exist to prevent is quiet and expensive: an organiser opens a
 * fixture, the box shows a time seven hours from the one on the schedule
 * because the conversion used the machine's zone, they press Save, and a game
 * moves. Nothing errors and nobody notices until people turn up.
 */
describe("toLocalInput", () => {
  it("shows the venue's wall clock, not UTC", () => {
    // 03:00 UTC is 10:00 in Bangkok, which is the time printed on the schedule
    // and the time somebody turns up.
    expect(toLocalInput("2026-06-10T03:00:00.000Z", "Asia/Bangkok")).toBe("2026-06-10T10:00")
  })

  it("crosses a date boundary correctly", () => {
    // 20:00 UTC is already the next morning in Bangkok. An implementation that
    // shifted the time and kept the date would be right for most of the day.
    expect(toLocalInput("2026-06-10T20:00:00.000Z", "Asia/Bangkok")).toBe("2026-06-11T03:00")
  })

  it("handles a zone behind UTC", () => {
    expect(toLocalInput("2026-06-10T03:00:00.000Z", "America/New_York")).toBe("2026-06-09T23:00")
  })

  it("returns an empty string for an unusable instant, rather than NaN", () => {
    // A blank input is a state a form can render; "NaN-aN-aN" is not.
    expect(toLocalInput("not-a-date", "Asia/Bangkok")).toBe("")
  })
})

describe("fromLocalInput", () => {
  it("reads the box as the venue's clock", () => {
    expect(fromLocalInput("2026-06-10T10:00", "Asia/Bangkok")).toBe("2026-06-10T03:00:00.000Z")
  })

  it("round-trips, which is what a form actually does", () => {
    // Open, change nothing, save. This must not move the game — the failure
    // that would drift a fixture by an hour every time somebody looked at it.
    for (const zone of ["Asia/Bangkok", "America/New_York", "Europe/London", "UTC"]) {
      for (const iso of [
        "2026-06-10T03:00:00.000Z",
        "2026-01-15T23:30:00.000Z",
        "2026-11-02T05:45:00.000Z",
      ]) {
        expect(fromLocalInput(toLocalInput(iso, zone), zone), `${iso} in ${zone}`).toBe(iso)
      }
    }
  })

  it("corrects across a DST change, where a single pass would be an hour out", () => {
    // New York in July is UTC-4; a naive implementation using the offset at the
    // wrong instant lands an hour off. Thailand has no DST, so this is about
    // the product not promising to stay in one country.
    expect(fromLocalInput("2026-07-04T12:00", "America/New_York")).toBe("2026-07-04T16:00:00.000Z")
    expect(fromLocalInput("2026-01-04T12:00", "America/New_York")).toBe("2026-01-04T17:00:00.000Z")
  })

  it("returns an empty string for an empty box", () => {
    expect(fromLocalInput("", "Asia/Bangkok")).toBe("")
  })
})
