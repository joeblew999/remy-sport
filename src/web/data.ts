// Fixtures for Remy Sport, and the types the pages render against.
//
// Events and teams are NO LONGER here — they come from the Workers API via
// lib/api.ts (ADR 008). Their `Event` and `Team` interfaces stay, because they
// are the shape the pages consume and what `toEvent()`/`toTeam()` map onto.
//
// Nothing is exported as data any more. BRACKET, LIVE_GAME, NEXT_GAME and FEED
// left on 2026-08-29, the way EVENTS and TEAMS did before them: the last page
// rendering each one started reading the database instead.
//
// The bracket was the only one that did not leave by getting an endpoint. A
// `game` row is two teams, a time and a status; the Product Owner's model has
// no round, no seed and no parent match, so nothing could ever have filled that
// screen. It was a picture of a feature, and the tab went with it — brackets
// come back when the model has them.

// Type-only import of the generated vocabulary. Erased at build time, so this
// adds nothing to the bundle and pulls no Node APIs into the webview — the one
// constraint src/web/ has to respect. Imported as well as re-exported because
// the type is used below in this file, and a bare re-export does not bind it.
import type { EventTypeCode as EventType } from "../domain/vocabularies";

export type Crest = "a" | "b";
export type { EventType };
/**
 * No `"open"`.
 *
 * It meant "registration open", and nothing could ever produce it: status is
 * derived from (start, end, now) and the model has no registration window at
 * all. So the type allowed a value the data cannot express, and three places
 * quietly did nothing as a result — a Discover filter tab that was permanently
 * empty, a status colour that never applied, and a "Register team" button on
 * the event hero that never rendered.
 *
 * It comes back when the PO's model has a registration window to derive it
 * from. Until then a type that admits it is a type that lies.
 */
export type EventStatus = "live" | "upcoming" | "closed";

export interface Team {
  id: string;
  /** Already in the reader's language — resolved in lib/api.ts. */
  name: string;
  short: string;
  crest: Crest;
  city: string;
  /** Absent until a games table exists — see lib/api.ts. */
  record?: string;
  /** The org the team belongs to (canonical `teams.org_id`). */
  orgName: string;
  /** The id, so a school's page can show its own teams. */
  orgId: string;
  ageGroupCode: string;
  genderCode: "M" | "F" | "COED";
  /** Display form of genderCode, from /api/reference in the reader's language. */
  genderLabel: string;
  /** The model's answer to EDIT_TEAM_PROFILE for this reader on this team. */
  canEdit: boolean;
  /** The full locale map, for a form that edits one language of it. */
  names: Record<string, string>;
}

export interface Event {
  id: string;
  type: EventType;
  /** Already in the reader's language — resolved in lib/api.ts. */
  title: string;
  div: string;
  loc: string;
  city: string;
  day: number;
  mo: string;
  date: string;
  status: EventStatus;
  statusLabel: string;
  /** Distinct teams entered. Real, from `eventTeam`. */
  teams: number;
  /** Venues this event is played across. Real, from `eventVenue`. */
  courts: number;
  games: number;
  gamesPlayed: number;
  /** People following it, from `subscription`. */
  followers: number;
  organizer: string;
  /**
   * May the reader edit this event?
   *
   * Carried through from the API's `canEdit`, which is the model's answer to
   * `EDIT_EVENT` for this viewer. It is what makes "Your events" mean yours
   * rather than everybody's — the profile page listed every event on the
   * platform under that heading until this existed.
   */
  canEdit: boolean;
  /** Narrower than canEdit: a co-organiser may edit but may not invite. */
  canInviteCoOrganizer: boolean;
  /**
   * The dates as stored, alongside `date` which is the formatted range.
   *
   * Both, because they answer different questions. `date` is for reading —
   * localised, abbreviated, "10–15 Jun". These are for editing, and a form
   * cannot round-trip a display string back into a day. Null where the
   * organiser has not said yet, which is a real state: an event can exist
   * before its dates are fixed.
   */
  startDate: string | null;
  endDate: string | null;
  /** The full locale map, for a form that edits one language of it. */
  names: Record<string, string>;
}

export interface BracketTeamRef {
  seed?: number;
  name: string;
  short: string;
  score?: number;
  win?: boolean;
  live?: boolean;
  tba?: boolean;
}

export interface BracketMatch {
  id: string;
  a: BracketTeamRef;
  b: BracketTeamRef;
  status: "done" | "live" | "upcoming";
  label?: string;
}

export interface BracketRound {
  label: string;
  matches: BracketMatch[];
}

export interface Bracket {
  rounds: BracketRound[];
}

export interface LiveGameTeam {
  id: string;
  name: string;
  short: string;
  crest: Crest;
  seed: number;
  record: string;
}

export interface PlayByPlayItem {
  ts: string;
  desc: string;
  score?: boolean;
}

export interface LiveGame {
  id: string;
  court: string;
  event: string;
  /** Invented, like everything else here — see the SAMPLE DATA banner on the
   *  page. These used to be typed straight into live.tsx, which made a fixture
   *  look like UI copy and put it in front of the translator. */
  eventShort: string;
  round: string;
  venue: string;
  scorer: string;
  quarter: string;
  clock: string;
  teamA: LiveGameTeam;
  teamB: LiveGameTeam;
  quarters: { a: (number | null)[]; total: number; b: (number | null)[] };
  watching: number;
  pbp: PlayByPlayItem[];
}

export interface RosterPlayer {
  num: number;
  name: string;
  pos: "PG" | "SG" | "SF" | "PF" | "C";
  height: string;
  pts: number;
  ast: number;
  reb: number;
}

export interface Standing {
  rank: number;
  team: string;
  short: string;
  w: number;
  l: number;
  pf: number;
  pa: number;
  pts: number;
  you?: boolean;
}

export interface FeedItem {
  desc: string;
  ts: string;
  dot?: "live" | "on" | "muted";
}
