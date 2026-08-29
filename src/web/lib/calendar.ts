/**
 * An event as a calendar file.
 *
 * "Add to calendar" was a `<button className="btn">` with no handler, sitting
 * beside two others that also did nothing. It is worth building rather than
 * deleting: an event's dates are the single most portable thing about it, and a
 * parent who wants a tournament in their phone's calendar is the most ordinary
 * request this product has.
 *
 * Built here rather than fetched, because everything it needs is already on the
 * page. An endpoint would be a round trip to reformat three fields.
 *
 * ## What this deliberately does not do
 *
 * No times, no reminders, no recurrence. An `event` row carries `startDate` and
 * `endDate` as *days* — a tournament runs from the 10th to the 15th, not from
 * 09:00 to 17:00 — so this emits an all-day range, which is what the data
 * actually says. Individual games have times; those are a schedule, and a
 * schedule is a different feature from a date in a diary.
 */

/** RFC 5545 wants CRLF, and `\n` alone is the classic reason a file will not import. */
const CRLF = "\r\n"

/**
 * Escape the four characters RFC 5545 reserves inside a text value.
 *
 * A comma in a Thai school's name would otherwise split one field into two, and
 * the failure is a calendar entry with a truncated title rather than an error.
 */
function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n")
}

/** `2026-06-10` → `20260610`. The DATE form, which is what an all-day event takes. */
function day(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, "")
}

/** The day after, because DTEND is exclusive for an all-day event. */
function dayAfter(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return day(d.toISOString())
}

/**
 * Fold a line at 75 octets, as the spec requires.
 *
 * Long lines are not merely untidy: some clients truncate at the limit rather
 * than wrapping, so a long Thai event name loses its tail. Folded at 74 with a
 * leading space on continuations.
 */
function fold(line: string): string {
  if (line.length <= 74) return line
  const parts = [line.slice(0, 74)]
  for (let i = 74; i < line.length; i += 73) parts.push(" " + line.slice(i, i + 73))
  return parts.join(CRLF)
}

export interface CalendarEvent {
  id: string
  title: string
  /** ISO day. Null when the organiser has not fixed one — see below. */
  startDate: string | null
  endDate: string | null
  /** Where, as a single line. Empty is fine; the field is simply omitted. */
  location?: string
  /** A link back to the event in the app. */
  url?: string
}

/**
 * The file's text, or null when there is no date to put in a calendar.
 *
 * Null rather than a file with today's date in it: an event whose dates are not
 * fixed is a real state, and inventing one would put a wrong entry in somebody's
 * diary — which is worse than a button that is not offered.
 */
export function toICS(event: CalendarEvent): string | null {
  if (!event.startDate) return null
  const end = event.endDate ?? event.startDate

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    // Anything unique identifies the producer; this says who wrote the file.
    "PRODID:-//Remy Sport//EN",
    // Without this an all-day range is interpreted as a floating time in some
    // clients, and the event lands a day out for anyone east of UTC.
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    // Stable per event, so re-adding updates the entry instead of duplicating
    // it. That is the difference between a button you can press twice and one
    // you have to be careful with.
    `UID:${event.id}@remy-sport`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "")}`,
    `DTSTART;VALUE=DATE:${day(event.startDate)}`,
    `DTEND;VALUE=DATE:${dayAfter(end)}`,
    `SUMMARY:${escapeText(event.title)}`,
    ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
    ...(event.url ? [`URL:${escapeText(event.url)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ]

  return lines.map(fold).join(CRLF) + CRLF
}

/**
 * Hand the file to the browser.
 *
 * A blob and a synthetic click, because there is no server round trip to hang a
 * Content-Disposition on and none is needed. The object URL is revoked, without
 * which every press leaks the file for the life of the page.
 */
export function downloadICS(event: CalendarEvent): boolean {
  const text = toICS(event)
  if (!text) return false
  const url = URL.createObjectURL(new Blob([text], { type: "text/calendar;charset=utf-8" }))
  const a = document.createElement("a")
  a.href = url
  a.download = `${event.id}.ics`
  a.click()
  URL.revokeObjectURL(url)
  return true
}
