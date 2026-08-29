// Client for the Workers API. The SPA is served same-origin from the Worker's
// [assets] binding, so every path here is relative — which is also what Tauri
// needs (biz decision-003: "asset paths must stay relative").

import type { Crest, Event, EventStatus, Team } from "../data";
import type { RouterClient } from "@orpc/server";
import type { Router } from "../../api/index";
import type { Localizer } from "./localizer";

/**
 * One event, as the contract declares it. Inferred, never written out — the
 * previous hand-written interface duplicated 15 fields and nothing checked it.
 */
export type ApiEvent = RouterClient<Router>["events"]["get"] extends
  (...a: never[]) => Promise<infer R> ? R : never

import * as PlainDate from "temporal-polyfill/fns/PlainDate";
import { formatDayRange, formatMonthShort } from "./dates";
import { m } from "./i18n";

const pd = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return PlainDate.create(y!, m!, d!);
};
const pdOf = (d: Date) => PlainDate.create(d.getFullYear(), d.getMonth() + 1, d.getDate());

/** Parse a `YYYY-MM-DD` day string without letting the local timezone shift it. */
function parseDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatRange(
  locale: Localizer["locale"],
  start: string | null,
  end: string | null,
): string {
  if (!start) return m.dates_tbc({}, { locale });
  return formatDayRange(locale, parseDay(start), end ? parseDay(end) : null);
}

/**
 * Status is derived from the date window rather than stored.
 *
 * The API has no `status` column and should not grow one: it is a function of
 * (start, end, now) and would go stale the moment it was written down. "open"
 * — registration open — is the one the dates genuinely cannot express, since
 * there is no registration model yet (ADR 008, Phase 2). Undated events read as
 * "upcoming", which is what an organiser who has not set dates yet means.
 */
function deriveStatus(start: string | null, end: string | null, today: Date): EventStatus {
  if (!start) return "upcoming";
  const s = pd(start);
  const e = end ? pd(end) : s;
  const now = pdOf(today);
  if (PlainDate.compare(now, s) < 0) return "upcoming";
  if (PlainDate.compare(now, e) > 0) return "closed";
  return "live";
}

/**
 * Whole calendar days from `a` to `b`.
 *
 * Not `(b - a) / 86_400_000`. A span crossing a daylight-saving transition is
 * not a whole number of 24-hour days — Melbourne's clocks go back on 5 April
 * 2026, so 1 April to 8 April is seven days and 169 hours. Dividing and
 * rounding turned that into "Starts in 8 days" for anyone viewing from a zone
 * that observes DST. Thailand does not, which is why the primary audience never
 * saw it and no test caught it.
 *
 * `Date.UTC` of the local year/month/day gives an instant with no offset to
 * shift, so the subtraction is exact whole days by construction.
 */
function daysBetween(a: Date, b: Date): number {
  return PlainDate.diffDays(pdOf(a), pdOf(b));
}

function statusLabel(
  locale: Localizer["locale"],
  status: EventStatus,
  start: string | null,
  today: Date,
): string {
  switch (status) {
    case "live":
      return m.status_live({}, { locale });
    case "closed":
      return m.status_finished({}, { locale });
    case "open":
      return m.status_registration_open({}, { locale });
    case "upcoming": {
      if (!start) return m.dates_tbc({}, { locale });
      const days = daysBetween(today, parseDay(start));
      if (days <= 0) return m.starts_today({}, { locale });
      return days === 1
        ? m.starts_tomorrow({}, { locale })
        : m.starts_in_days({ days }, { locale });
    }
  }
}

/**
 * Map an API event onto the shape the pages already render.
 *
 * Five fields have no backing table yet and are deliberately left as
 * placeholders rather than invented: `div` (canonical `divisions`), `loc`
 * (canonical `venues`/`event_venues`), and the `teams`/`courts`/`games`/
 * `gamesPlayed` counts. ADR 008 tracks them to roadmap Phase 2/3.
 */
export function toEvent(e: ApiEvent, loc: Localizer, today: Date = new Date()): Event {
  const status = deriveStatus(e.startDate, e.endDate, today);
  const start = e.startDate ? parseDay(e.startDate) : null;
  return {
    id: e.id,
    type: e.typeCode,
    // Already in the reader's language: pages render `title`, they do not
    // choose between a pair of fields.
    title: loc.name(e.names, e.name),
    div: "—",
    loc: m.venue_tbc({}, { locale: loc.locale }),
    city: loc.label("cities", e.cityCode) || "—",
    day: start ? start.getDate() : 0,
    mo: start ? formatMonthShort(loc.locale, start) : "TBC",
    date: formatRange(loc.locale, e.startDate, e.endDate),
    status,
    statusLabel: statusLabel(loc.locale, status, e.startDate, today),
    teams: 0,
    courts: 0,
    games: 0,
    gamesPlayed: 0,
    organizer: e.organizerName ?? m.unknown_organiser({}, { locale: loc.locale }),
    // The model's answer, not the client's guess. False for a signed-out
    // reader, which is what makes a "yours" list empty rather than wrong.
    canEdit: e.canEdit,
    canInviteCoOrganizer: e.canInviteCoOrganizer,
    startDate: e.startDate,
    endDate: e.endDate,
    names: e.names as Record<string, string>,
  };
}

// ── Teams ──────────────────────────────────────────────────────────────────

/** One team, as the contract declares it. Inferred, never written out. */
export type ApiTeam = RouterClient<Router>["teams"]["get"] extends
  (...a: never[]) => Promise<infer R> ? R : never

/**
 * Short code shown on crests and in tables.
 *
 * Canonical `teams` has no short-code column, so this derives one from the
 * org name's initials rather than adding a field the PO has not defined.
 * Initials only — never a slice of a single word, which produces unfortunate
 * three-letter strings.
 */
export function shortCode(name: string): string {
  const initials = name
    .split(/\s+/)
    .filter(w => /^[A-Za-z]/.test(w))
    .map(w => w[0]!.toUpperCase());
  return initials.slice(0, 3).join("") || "—";
}

/** Crest variant is decorative; pick one deterministically so it never flickers. */
function crestFor(id: string): Crest {
  let sum = 0;
  for (const ch of id) sum += ch.charCodeAt(0);
  return sum % 2 === 0 ? "a" : "b";
}

export function toTeam(t: ApiTeam, loc: Localizer): Team {
  const orgName = loc.name(t.orgNames, t.orgName ?? "");
  return {
    id: t.id,
    name: loc.name(t.names, t.name),
    // Initials come off the English pivot on purpose: a crest reading "ทบอ"
    // beside a Latin-script league table is worse than a stable "ACB".
    short: shortCode(t.orgName ?? t.name),
    crest: crestFor(t.id),
    city: loc.label("cities", t.orgCityCode) || "—",
    // `record` needs played games. No games table exists yet (ADR 008), and a
    // fabricated "4–0" on a real team reads as fact — so leave it absent.
    record: undefined,
    orgName: orgName || "—",
    ageGroupCode: t.ageGroupCode,
    genderCode: t.genderCode,
    // From /api/reference, not a map written out here. The hardcoded one said
    // "Mixed" where the PO says "Co-ed" — the exact drift ADR 015 was about.
    genderLabel: loc.label("genders", t.genderCode),
    canEdit: t.canEdit,
    names: t.names as Record<string, string>,
  };
}
