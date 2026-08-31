/**
 * How a date is *displayed*. Arithmetic is elsewhere — see `lib/api.ts`, which
 * uses `temporal-polyfill/fns/PlainDate`.
 *
 * The split is the point, and it is not arbitrary:
 *
 *   display     `Intl` already knows every locale the runtime knows, and every
 *               calendar too. It costs nothing, because it is the runtime.
 *   arithmetic  `Intl` cannot do it at all, and `Date` can only do it in the
 *               proleptic Gregorian calendar, in the machine's own zone.
 *
 * Reaching for a library to *format* a date is how you end up shipping bytes to
 * reimplement `Intl`; reaching for `Date` to do calendar arithmetic is how you
 * end up with `Math.ceil(ms / 86_400_000)` and a countdown that is a day out
 * across a daylight-saving boundary. Both happened here.
 *
 * This file replaced a hardcoded English month array:
 *
 *     const MONTHS = ["JAN", "FEB", "MAR", …]
 *
 * Every event date on the site was formatted from it, so the Thai page rendered
 * "AUG 1–2, 2026 · Venue TBC · กรุงเทพมหานคร" — an English month in a Thai
 * sentence — and every locale added after Thai would have done the same.
 */

/**
 * One calendar, chosen once.
 *
 * Thai defaults to the Buddhist era, so `th` alone renders 2569 for 2026. That
 * is *correct* for a Thai reader and this file still forces Gregorian, because
 * a page showing 2569 in one line and 2026 in the next is worse than either
 * choice made consistently — which is exactly what happened while the schedule
 * formatted through `Intl` and the event list through a hardcoded array.
 *
 * Offering era-correct dates is a real thing to do and a real decision to make:
 * Buddhist for `th`, Japanese eras for `ja`, Hijri for `ar`. `Intl` renders all
 * of them today, and `temporal-polyfill/fns/PlainDate.withCalendar` is what
 * does arithmetic in them. When that decision is made, it is made HERE, once,
 * and it changes everywhere at once. That is the whole reason this constant
 * exists rather than `-u-ca-gregory` being spelled out at each call site.
 */
export const CALENDAR = "gregory";

/** The locale tag as `Intl` should read it, with the calendar decision applied. */
export const tag = (locale: string) => `${locale}-u-ca-${CALENDAR}`;

/**
 * `Intl.DateTimeFormat` construction is the expensive part, not `.format()`.
 * These are built per (locale, shape) and there are a handful of each.
 */
const cache = new Map<string, Intl.DateTimeFormat>();
function fmt(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let f = cache.get(key);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat(tag(locale), options);
    } catch {
      // A malformed locale tag throws RangeError, and this runs while rendering
      // a list — an unrecognised locale should mis-format one line, not blank
      // the page. An unknown but well-formed tag ("yo-NG") does not throw at
      // all, it falls back, so this only catches a genuinely broken value.
      //
      // The retry keeps `options` intact, which is the load-bearing part: an
      // unknown *timeZone* also throws from that same constructor, and it must
      // keep throwing. Dropping it here would silently fall back to the
      // machine's own clock and render a confident wrong time — the failure
      // `formatTimeOn`'s caller catches and answers with UTC instead. So this
      // second call throws too when the zone is the broken thing, and that is
      // deliberate rather than an oversight.
      f = new Intl.DateTimeFormat(undefined, options);
    }
    cache.set(key, f);
  }
  return f;
}

const DAY: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };

/**
 * "1 Aug 2026", or "1–2 Aug 2026" for a range — in the reader's language.
 *
 * `formatRange` rather than formatting both ends and joining with an en dash:
 * it is the API built for this, and it knows that a range within one month
 * collapses differently in every language. The hand-rolled version had three
 * branches for same-day / same-month / same-year, all of them assuming English
 * word order.
 */
export function formatDayRange(locale: string, start: Date, end: Date | null): string {
  const f = fmt(locale, DAY);
  if (!end || start.getTime() === end.getTime()) return f.format(start);
  return f.formatRange(start, end);
}

/** Just the month, for the date block on an event card. */
export function formatMonthShort(locale: string, d: Date): string {
  return fmt(locale, { month: "short" }).format(d);
}

/**
 * Month and year, from the model's ISO day strings.
 *
 * Tenure on a team is recorded as a day — `player_team.from_date` is
 * "2024-03-01" — but a roster reads better as "Mar 2024" than as a precise
 * date nobody chose deliberately: the fixtures record the month someone
 * joined, and the first of it is an artefact of needing a day column.
 *
 * Parsed as UTC noon rather than with `new Date(iso)`, which reads a bare
 * "2024-03-01" as midnight UTC and renders it as February in every timezone
 * west of London.
 */
export function formatMonthYear(locale: string, iso: string | null): string {
  return formatIso(locale, iso, { month: "short", year: "numeric" });
}

/** The whole day — "12 Mar 2026" — from the model's ISO day strings. */
export function formatIsoDay(locale: string, iso: string | null): string {
  return formatIso(locale, iso, DAY);
}

/**
 * Shared parse for the model's `YYYY-MM-DD` columns.
 *
 * UTC noon rather than `new Date(iso)`, which reads a bare "2024-03-01" as
 * midnight UTC and renders it as February in every timezone west of London.
 */
function formatIso(locale: string, iso: string | null, opts: Intl.DateTimeFormatOptions): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "";
  return fmt(locale, opts).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/**
 * An instant, on a named clock, in the reader's language.
 *
 * The zone is passed explicitly and never defaults to the machine's: a page
 * that guesses is how a coach turns up an hour late. An IANA name the runtime
 * does not know throws rather than degrading, so the caller falls back to the
 * instant rather than to a zone somebody assumed.
 */
export function formatTimeOn(locale: string, at: Date, timeZone: string | null): string {
  return fmt(locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).format(at);
}

/**
 * Just the clock time, on a named zone — "16:00", "4:00 PM".
 *
 * `formatTimeOn` above carries the day with it, which is right for a single
 * fixture and wrong for a range: a camp session rendered start and end with it
 * read "Mon, Jul 6, Jul 6 at 04:00 PM – Jul 6 at 06:00 PM". A timetable names
 * the day once and then two times.
 *
 * Same rule about the zone as its neighbour: passed explicitly, never the
 * machine's. A session at 09:00 UTC is 16:00 in Bangkok, and a parent reading
 * their own clock would arrive five hours early.
 */
export function formatClockOn(locale: string, at: Date, timeZone: string | null): string {
  return fmt(locale, {
    hour: "2-digit",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).format(at);
}

/**
 * "5 minutes ago", "yesterday" — in the reader's language.
 *
 * `formatWhen` in lib/devices.ts hand-rolled this and returned English:
 * "just now", "5m ago", "yesterday", "3d ago". It shipped on the devices page,
 * which is a security screen — the one place somebody is trying to work out
 * whether a session is theirs — and it read in English whatever language they
 * had chosen.
 *
 * `Intl.RelativeTimeFormat` is native and knows every locale, the same way
 * `DateTimeFormat` does. `numeric: "auto"` is what produces "yesterday" rather
 * than "1 day ago"; without it every language gets the wooden form.
 *
 * The unit is chosen here rather than by the caller because the thresholds are
 * the same everywhere — under a minute, under an hour, under a day — while the
 * WORDS are not, and those are the part `Intl` owns.
 */
export function formatSince(locale: string, iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";

  const seconds = Math.round((then - now) / 1000);
  const abs = Math.abs(seconds);

  let value: number;
  let unit: Intl.RelativeTimeFormatUnit;
  if (abs < 60) [value, unit] = [seconds, "second"];
  else if (abs < 3600) [value, unit] = [Math.round(seconds / 60), "minute"];
  else if (abs < 86_400) [value, unit] = [Math.round(seconds / 3600), "hour"];
  else [value, unit] = [Math.round(seconds / 86_400), "day"];

  try {
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(value, unit);
  } catch {
    // Same reasoning as `fmt` above: a malformed tag must not blank the page.
    return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(value, unit);
  }
}

/**
 * Day and month, for one row in a list of fixtures.
 *
 * Ordering is the locale's, not ours: "May 4" in English, "4 พ.ค." in Thai,
 * "5月4日" in Japanese. A template of `${month} ${day}` would have produced the
 * English order in all three, which is exactly the kind of thing that looks
 * fine to whoever wrote it.
 */
export function formatDayShort(locale: string, d: Date): string {
  return fmt(locale, { month: "short", day: "numeric" }).format(d);
}

/**
 * A named clock's offset from UTC, in minutes, at a given instant.
 *
 * Asked of `Intl` rather than of a table, because the answer changes with the
 * date — a zone's offset is a function of *when*, not just where, and a fixed
 * "+7" would be wrong for every zone that has ever moved.
 *
 * The trick is that formatting an instant in a zone and then reading those
 * wall-clock parts back as though they were UTC gives a number whose distance
 * from the original instant is exactly the offset.
 */
function offsetMinutes(at: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    // `hour12: false` renders midnight as 24 in some ICU versions.
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return (asIfUtc - at.getTime()) / 60_000;
}

/**
 * A UTC instant as the wall-clock string an `<input type="datetime-local">`
 * wants — `2026-06-10T10:00` — on a named clock.
 *
 * The zone matters and must not be the machine's. An organiser in Bangkok
 * editing a Bangkok fixture from a laptop still set to UTC would otherwise be
 * shown, and would save, a time seven hours from the one printed on the
 * schedule.
 */
export function toLocalInput(iso: string, timeZone: string | null): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const zone = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const shifted = new Date(at.getTime() + offsetMinutes(at, zone) * 60_000);
  return shifted.toISOString().slice(0, 16);
}

/**
 * The inverse: a wall-clock string on a named clock, back to a UTC instant.
 *
 * Two passes. The offset depends on the instant, and the instant is what we are
 * solving for, so the first guess uses the offset at the wrong moment and the
 * second corrects it. That converges immediately everywhere except inside a DST
 * transition — an hour that either does not exist or happens twice, where no
 * answer is fully correct and this picks one.
 *
 * Thailand has not observed DST since 1952, so for this product it is exact;
 * the second pass is there because the product does not promise to stay in one
 * country.
 */
export function fromLocalInput(local: string, timeZone: string | null): string {
  if (!local) return "";
  const zone = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const asUtc = new Date(`${local.length === 16 ? local : local.slice(0, 16)}:00Z`);
  if (Number.isNaN(asUtc.getTime())) return "";
  const first = new Date(asUtc.getTime() - offsetMinutes(asUtc, zone) * 60_000);
  const second = new Date(asUtc.getTime() - offsetMinutes(first, zone) * 60_000);
  return second.toISOString();
}
