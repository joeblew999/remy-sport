/**
 * The controlled vocabularies, served (ADR 015).
 *
 * Every vocabulary the Product Owner defines, with no list of them here. The
 * tables, their order, and the response schema are all generated from the
 * fixtures — so a vocabulary added upstream appears on this endpoint, typed and
 * translated, without this file changing.
 *
 * It used to join a `translation` catalogue and merge the result into every
 * row. Each vocabulary now carries its own `names`/`descriptions` JSON, so the
 * response is the tables and there is nothing to merge.
 */

import { asc } from "drizzle-orm"
import { z } from "zod"
import { ReferenceSchema } from "../domain/api"
import { FALLBACK } from "../domain/names"
import { LOCALE_CODES } from "../domain/vocabularies"
import { VOCABULARY_TABLES } from "../db/vocabularies-schema"
import { infrastructure, pub } from "./base"

/**
 * One language, not all of them.
 *
 * Every vocabulary row carries a `names` object with an entry per locale, so
 * the whole response grew with the language count: at twenty-seven it was 98KB
 * gzipped carrying 8,004 translated names, sent to every reader so that one of
 * them could be rendered. Trimming here rather than in the client is the whole
 * point — a client-side filter still moves the bytes.
 *
 * `FALLBACK` rides along because `pick()` falls back to it: shipping only the
 * requested locale would render an untranslated term blank instead of in
 * English. Two entries, never one.
 *
 * docs/2026-09-09-17-reference-payload-per-locale.md.
 */
function forLocale<T>(rows: T[], locale: string): T[] {
  const keep = new Set([locale, FALLBACK])
  const trim = (value: unknown) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([l]) => keep.has(l)))
      : value
  return rows.map((row) => {
    const r = row as Record<string, unknown>
    // Only the two translated columns; everything else is passed through
    // untouched so this cannot quietly drop a field the contract requires.
    if (!("names" in r) && !("descriptions" in r)) return row
    return {
      ...r,
      ...("names" in r ? { names: trim(r.names) } : {}),
      ...("descriptions" in r ? { descriptions: trim(r.descriptions) } : {}),
    } as T
  })
}

export const list = pub
  .use(infrastructure("the controlled vocabularies — the model's own labels, which every page needs to render a code"))
  .route({
    method: "GET",
    path: "/reference",
    summary: "Controlled vocabularies, as the Product Owner defines them",
  })
  /**
   * Optional, and English when absent.
   *
   * A caller that has not been updated keeps working and gets English, which is
   * what `FALLBACK` would have given it anyway. Making it required would break
   * the render stubs and any bookmark of `/api/reference` for no benefit.
   */
  .input(z.object({ locale: z.enum(LOCALE_CODES).optional() }).optional())
  .output(ReferenceSchema)
  .handler(async ({ context: { db }, input }) => {
    const locale = input?.locale ?? FALLBACK
  // Ordered by `sort`, which every vocabulary table carries, so the PO controls
  // dropdown order by ordering the model — sorting by code gives OPEN, SENIOR,
  // U10, U12…
  const entries = await Promise.all(
    Object.entries(VOCABULARY_TABLES).map(async ([key, table]) => [
      key,
      forLocale(await db.select().from(table).orderBy(asc(table.sort)).all(), locale),
    ]),
  )
  // The cast is the one seam: `Object.entries` erases the key literals that
  // make this endpoint typed. The contract still validates the result at
  // runtime, so a mismatch fails the request rather than reaching a client.
  return Object.fromEntries(entries) as z.infer<typeof ReferenceSchema>
})
