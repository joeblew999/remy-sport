// Types for rendering in the reader's language.
//
// Deliberately a .ts module with no JSX: src/web/lib/api.ts is plain
// TypeScript, and importing a .tsx module from it drags React's JSX types into
// a file that has no business with them.
//
// The React side — the provider, the hooks, the switcher — lives in locale.tsx.

import { LOCALES, type Locale } from "../../domain/vocabularies";

export { LOCALES, type Locale };

/** Display names keyed by locale, as every API endpoint returns them. */
export type Names = Record<string, string>;

/** A vocabulary served by /api/reference. */
export type Vocabulary =
  | "ageGroups"
  | "genders"
  | "orgTypes"
  | "eventTypes"
  | "eventFormats"
  | "provinces"
  | "cities";

export interface Term {
  code: string;
  names: Names;
}

/** The /api/reference payload. */
export interface Reference {
  locales: { code: string; nameEn: string }[];
  ageGroups: Term[];
  genders: Term[];
  orgTypes: Term[];
  eventTypes: Term[];
  eventFormats: Term[];
  provinces: Term[];
  cities: Term[];
}

export const VOCABULARIES = [
  "ageGroups",
  "genders",
  "orgTypes",
  "eventTypes",
  "eventFormats",
  "provinces",
  "cities",
] as const satisfies readonly Vocabulary[];

/**
 * Resolving a name or a code into the current language.
 *
 * Passed into the API mappers rather than read inside them, so the mapping
 * layer stays a pure function of (payload, locale) and a locale switch
 * re-derives the view models instead of leaving half of them stale.
 */
export interface Localizer {
  locale: Locale;
  /** A record's own name. Falls back through English to the empty string. */
  name(names: Names | undefined, fallback?: string): string;
  /** A vocabulary term's name. Falls back to the code, which is never blank. */
  label(vocabulary: Vocabulary, code: string | null | undefined): string;
}
