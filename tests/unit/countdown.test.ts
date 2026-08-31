/**
 * "Starts in N days" counts calendar days, in every timezone.
 *
 * The countdown used to divide elapsed milliseconds by 86_400_000. That is one
 * day only when the day is 24 hours long, and twice a year it is not: a span
 * crossing a daylight-saving transition is 23 or 25 hours, and `Math.ceil` then
 * reports a day too many.
 *
 * It survived because Thailand has no DST, so the primary audience always saw
 * the right number. Every case below is a real transition in a zone somebody
 * might read this from.
 *
 * `process.env.TZ` rather than the machine's zone: a test that only fails in
 * Melbourne is a test that passes here and breaks in production.
 */
import { describe, it, expect, afterAll } from "bun:test"
import { toEvent } from "../../src/web/lib/api"
import { apiEvent } from "../helpers/api-fixtures"
import type { Localizer } from "../../src/web/lib/localizer"

/**
 * A localizer that returns the fallback, so the assertions are about dates and
 * not about translation. Typed as the real `Localizer` — the cast that was here
 * also hid the signatures, and `name(names, fallback?)` has an *optional*
 * second parameter, which a stub declaring it required cannot stand in for.
 */
const loc: Localizer = {
  locale: "en",
  name: (_names, fallback) => fallback ?? "",
  label: () => "",
}

/**
 * From the shared factory. This was a partial literal cast with `as never`, so
 * it compiled fine and then threw the day the API grew a field it did not have.
 */
const event = (startDate: string) =>
  apiEvent({
    id: "evt",
    typeCode: "TOURNAMENT",
    names: {},
    name: "Test",
    cityCode: null,
    startDate,
    endDate: startDate,
    organizerName: null,
  })

/** The label a viewer in `tz` sees on `today` for an event starting `start`. */
function labelIn(tz: string, today: [number, number, number], start: string): string {
  /**
   * Restore by deleting when there was nothing, not by assigning `undefined`.
   *
   * `process.env.TZ = undefined` does not put the zone back — Bun leaves the
   * process on whatever was set last, so every unit file running after this one
   * saw Australia/Melbourne as local time. Latent today because nothing after
   * it depends on the machine zone; a trap for whatever is added next.
   */
  const was = process.env.TZ
  process.env.TZ = tz
  try {
    return toEvent(event(start), loc, new Date(today[0], today[1], today[2])).statusLabel
  } finally {
    if (was === undefined) delete process.env.TZ
    else process.env.TZ = was
  }
}

const ORIGINAL_TZ = process.env.TZ
afterAll(() => {
  // Delete, do not assign undefined — see the note in `labelIn`.
  if (ORIGINAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIGINAL_TZ
})

describe("the countdown", () => {
  it("is seven days in a zone with no daylight saving", () => {
    // Asia/Bangkok — the primary audience, and the reason this went unnoticed.
    expect(labelIn("Asia/Bangkok", [2026, 3, 1], "2026-04-08")).toBe("Starts in 7 days")
  })

  it("is seven days across a fall-back transition", () => {
    // Australia/Melbourne puts its clocks back on 5 April 2026, so this span is
    // 169 hours. Dividing by 86_400_000 and rounding up said "8 days".
    expect(labelIn("Australia/Melbourne", [2026, 3, 1], "2026-04-08")).toBe("Starts in 7 days")
  })

  it("is seven days across a spring-forward transition", () => {
    // Europe/London goes forward on 29 March 2026 — 167 hours, the other
    // direction, which a `Math.floor` fix would have got wrong instead.
    expect(labelIn("Europe/London", [2026, 2, 26], "2026-04-02")).toBe("Starts in 7 days")
  })

  it("still says tomorrow across a transition", () => {
    expect(labelIn("Australia/Melbourne", [2026, 3, 4], "2026-04-05")).toBe("Starts tomorrow")
  })

  it("is live on the day itself, not counting down to it", () => {
    // Worth pinning: an event is live from its first day, so the countdown
    // never reaches zero. `statusLabel`'s `days <= 0` branch — "Starting today"
    // — is unreachable for that reason, and this is the test that says so
    // rather than leaving the next reader to work it out from two functions.
    expect(labelIn("Australia/Melbourne", [2026, 3, 5], "2026-04-05")).toBe("Live now")
  })
})
