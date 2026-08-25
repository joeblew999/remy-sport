/**
 * Display names, keyed by locale.
 *
 * The whole localisation story is this type plus one JSON column. There is no
 * translation table, no `nameTh` field, and no mapping layer — a name is a
 * property of the row, so it crosses the stack unaided:
 *
 *   drizzle column  ->  drizzle-zod response schema  ->  oRPC contract  ->  client
 *
 * Adding a language edits a value in a cell. Coverage across the fixtures is
 * enforced upstream by remy-sport-biz's `data:check`.
 */

import { LOCALES, type Locale } from "./vocabularies"

export type Names = Partial<Record<Locale, string>>

/** English is the pivot: every row has one, so this never returns nothing. */
export const FALLBACK: Locale = "en"

/** Resolve a name in the reader's language, degrading rather than blanking. */
export function pick(names: Names | undefined, locale: Locale, fallback = ""): string {
  return names?.[locale] || names?.[FALLBACK] || fallback
}

/**
 * The pivot to store on the row.
 *
 * Falls back to the first supplied language rather than demanding English, so
 * a Thai-only submission is still valid and still renderable.
 */
export function pivot(names: Names): string | undefined {
  return names[FALLBACK]?.trim() || LOCALES.map((l) => names[l]?.trim()).find(Boolean)
}

/** Drop empty values — a blank name renders worse than an absent one. */
export function clean(names: Names): Names {
  return Object.fromEntries(
    LOCALES.flatMap((l) => {
      const v = names[l]?.trim()
      return v ? [[l, v]] : []
    }),
  )
}
