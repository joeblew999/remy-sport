// Types for rendering in the reader's language.
//
// Deliberately a .ts module with no JSX: src/web/lib/api.ts is plain
// TypeScript, and importing a .tsx module from it drags React's JSX types into
// a file that has no business with them.
//
// The React side — the provider, the hooks, the switcher — lives in locale.tsx.

import type { RouterClient } from "@orpc/server";
import type { Router } from "../../api/index";
import { LOCALES, type Locale } from "../../domain/vocabularies";

export { LOCALES, type Locale };

/** Display names keyed by locale, as every API endpoint returns them. */
export type Names = Record<string, string>;

/**
 * A vocabulary served by /api/reference — derived, not listed.
 *
 * There were seven names written out here; there are twenty upstream now. The
 * key set comes from the contract, so it cannot fall behind again.
 */
export type Vocabulary = keyof Reference

/**
 * The reference payload, inferred from the contract.
 *
 * Written out as an interface once — seven arrays of `{code, names}` — which
 * meant the SPA restated a shape the contract already declared, and nothing
 * checked the two agreed. Adding `cities` upstream silently left this behind.
 */
export type Reference = Awaited<ReturnType<RouterClient<Router>["reference"]["list"]>>

/**
 * A vocabulary term. `descriptions` only where the Product Owner wrote one —
 * notification types and org roles have them; cities and locales do not.
 */
export type Term = { code: string; names: Names; descriptions?: Names | null }



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
  /**
   * A vocabulary term's description, where the model has one.
   *
   * Falls back to the empty string, never to the code: a description is
   * explanatory text and a bare "SCORE_UPDATE" under a label reading "Score
   * Update" explains nothing. Callers render it only when it is non-empty.
   *
   * Every vocabulary has carried these in three languages since the fixtures
   * were written — "Score changed during a live match" — and no screen showed
   * one, so switches were labelled with two words and no explanation.
   */
  describe(vocabulary: Vocabulary, code: string | null | undefined): string;
}
