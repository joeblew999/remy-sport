// Client for the Workers API. The SPA is served same-origin from the Worker's
// [assets] binding, so every path here is relative — which is also what Tauri
// needs (biz decision-003: "asset paths must stay relative").

import type { Crest, Event, EventStatus, EventType, Team } from "../data";

/** One event as `GET /api/events` returns it — see src/routes/events.ts. */
export interface ApiEvent {
  id: string;
  name: string;
  nameTh: string | null;
  type: EventType;
  format: "5x5" | "3x3";
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  city: string | null;
  provinceCode: string | null;
  isFibaCertified: boolean;
  createdBy: string;
  organizerName: string | null;
  createdAt: string;
  updatedAt: string;
}

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
export function toEvent(e: ApiEvent, today: Date = new Date()): Event {
  const status = deriveStatus(e.startDate, e.endDate, today);
  const start = e.startDate ? parseDay(e.startDate) : null;
  return {
    id: e.id,
    type: e.type,
    title: e.name,
    titleTh: e.nameTh ?? undefined,
    div: "—",
    loc: "Venue TBC",
    city: e.city ?? "—",
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

/** One team as `GET /api/teams` returns it — see src/routes/teams.ts. */
export interface ApiTeam {
  id: string;
  name: string;
  nameTh: string | null;
  ageGroupCode: string;
  genderCode: "M" | "F" | "COED";
  orgId: string;
  orgName: string | null;
  orgNameTh: string | null;
  orgCity: string | null;
  orgProvinceCode: string | null;
}

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

const GENDER_LABEL: Record<ApiTeam["genderCode"], string> = {
  M: "Boys",
  F: "Girls",
  COED: "Mixed",
};

export function toTeam(t: ApiTeam): Team {
  return {
    id: t.id,
    name: t.name,
    nameTh: t.nameTh ?? undefined,
    short: shortCode(t.orgName ?? t.name),
    crest: crestFor(t.id),
    city: t.orgCity ?? "—",
    // `record` needs played games. No games table exists yet (ADR 008), and a
    // fabricated "4–0" on a real team reads as fact — so leave it absent.
    record: undefined,
    orgName: t.orgName ?? "—",
    orgNameTh: t.orgNameTh ?? undefined,
    ageGroupCode: t.ageGroupCode,
    genderCode: t.genderCode,
    genderLabel: GENDER_LABEL[t.genderCode] ?? t.genderCode,
  };
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export async function fetchEvents(): Promise<Event[]> {
  const { events } = await get<{ events: ApiEvent[] }>("/api/events");
  return events.map((e) => toEvent(e));
}

export async function fetchEvent(id: string): Promise<Event | undefined> {
  try {
    return toEvent(await get<ApiEvent>(`/api/events/${encodeURIComponent(id)}`));
  } catch {
    // A missing event is a normal outcome for a hash deep-link to a deleted or
    // mistyped id — the page renders its own "not found", so don't throw.
    return undefined;
  }
}

export async function fetchTeams(): Promise<Team[]> {
  const { teams } = await get<{ teams: ApiTeam[] }>("/api/teams");
  return teams.map(toTeam);
}

export async function fetchTeam(id: string): Promise<Team | undefined> {
  try {
    return toTeam(await get<ApiTeam>(`/api/teams/${encodeURIComponent(id)}`));
  } catch {
    return undefined;
  }
}
