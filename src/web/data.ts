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
// Their *types* outlived them by a day — ten interfaces describing the shape of
// data that no longer existed, imported by nothing. A type with no values and
// no readers is a description of a screen somebody might build, which is what
// the deleted fixtures were too.
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
import type { ApiEvent, ApiTeam } from "../domain/api";

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

/**
 * A team as a page draws it: the API row, whole, plus what the reader's
 * language adds. See `toTeam` in lib/api.ts.
 *
 * `ApiTeam & {…}` rather than a second list of fields. The interface this
 * replaces copied the API's fields by hand under its own names, so a field the
 * API grew was invisible to every page until somebody copied it here, and a
 * page could not use the API's own name for anything. Only what is derived is
 * named; everything else is the row, under the row's name.
 */
export type Team = ApiTeam & {
  /** Already in the reader's language, over the API's English pivot. */
  name: string;
  short: string;
  crest: Crest;
  /** The org's city and province, in the reader's language. */
  city: string;
  province: string;
  /** The org's name in the reader's language, or "—". */
  orgName: string;
  /** The same facts in the reader's language — see `toTeam`. */
  ageGroupLabel: string;
  genderLabel: string;
};

/**
 * An event as a page draws it: the API row, whole, plus what the reader's
 * language adds. See `toEvent` in lib/api.ts, and the note on `Team`.
 *
 * The raw codes and dates stay on the row under the API's names — `cityCode`
 * and `provinceCode` are what a filter compares, `startDate` and `endDate` are
 * what a form edits, `can` is the model's answer per action — and the labels
 * beside them are for reading: localised, abbreviated, "10–15 Jun".
 */
export type Event = ApiEvent & {
  /** Already in the reader's language, over the API's English pivot. */
  title: string;
  /** The divisions entered: one reads as its name, several as a count, none as "—". */
  division: string;
  /** The primary venue, or "Venue TBC". */
  venue: string;
  /** Which city and which of Thailand's 77 provinces, in the reader's language. */
  city: string;
  province: string;
  /** The calendar tile: day of month, and the short month or "TBC". */
  day: number;
  month: string;
  /** The formatted range. */
  date: string;
  /** Derived from the date window, never stored — see `deriveStatus`. */
  status: EventStatus;
  statusLabel: string;
  /** The organiser's name, or "Unknown organiser" in the reader's language. */
  organizer: string;
};
