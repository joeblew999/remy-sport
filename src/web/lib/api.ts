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

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** Parse a `YYYY-MM-DD` day string without letting the local timezone shift it. */
function parseDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatRange(start: string | null, end: string | null): string {
  if (!start) return "Dates TBC";
  const s = parseDay(start);
  if (!end || end === start) {
    return `${MONTHS[s.getMonth()]} ${s.getDate()}, ${s.getFullYear()}`;
  }
  const e = parseDay(end);
  const sameMonth = s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth();
  if (sameMonth) {
    return `${MONTHS[s.getMonth()]} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`;
  }
  const sameYear = s.getFullYear() === e.getFullYear();
  const left = `${MONTHS[s.getMonth()]} ${s.getDate()}`;
  const right = `${MONTHS[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
  return sameYear ? `${left} – ${right}` : `${left}, ${s.getFullYear()} – ${right}`;
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
  const s = parseDay(start);
  const e = end ? parseDay(end) : s;
  // Compare at day granularity — an event is live on its final day, not until
  // midnight at the start of it.
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (now < s) return "upcoming";
  if (now > e) return "closed";
  return "live";
}

function statusLabel(status: EventStatus, start: string | null, today: Date): string {
  switch (status) {
    case "live":
      return "Live now";
    case "closed":
      return "Finished";
    case "open":
      return "Registration open";
    case "upcoming": {
      if (!start) return "Dates TBC";
      const days = Math.ceil(
        (parseDay(start).getTime() -
          new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) /
          86_400_000,
      );
      if (days <= 0) return "Starting today";
      return days === 1 ? "Starts tomorrow" : `Starts in ${days} days`;
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
    loc: "Venue TBC",
    city: loc.label("cities", e.cityCode) || "—",
    day: start ? start.getDate() : 0,
    mo: start ? MONTHS[start.getMonth()] : "TBC",
    date: formatRange(e.startDate, e.endDate),
    status,
    statusLabel: statusLabel(status, e.startDate, today),
    teams: 0,
    courts: 0,
    games: 0,
    gamesPlayed: 0,
    organizer: e.organizerName ?? "Unknown organiser",
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
  };
}
