/**
 * Localized text, in one place.
 *
 * Every display string in this codebase follows one rule, whether it belongs to
 * a controlled vocabulary or to a row someone created:
 *
 *   - the English value lives on the row as a NOT NULL pivot (`name_en` on the
 *     vocabularies, `name` on the entities). It is the guaranteed fallback and
 *     the column things are sorted by;
 *   - every language, English included, is a row in `translation`, keyed
 *     (table_name, record_key, field_name, locale_code).
 *
 * So shipping a third language is INSERTs. It is never an ALTER TABLE, a new
 * type field, or an edit to a route — which is exactly what `name_th` columns
 * used to cost. See migrations 0009 and 0010.
 *
 * The API speaks `names`: a locale-keyed map, in both directions. Callers never
 * touch the `translation` table directly; they use the four functions here.
 */

import { and, eq, inArray } from "drizzle-orm"
import type { DrizzleD1Database } from "drizzle-orm/d1"
import * as schema from "../db/schema"
import { LOCALES } from "./vocabularies"

/**
 * Display names keyed by locale code.
 *
 * Keys are locale codes at runtime; typed as `string` rather than the `Locale`
 * union so it maps cleanly onto the wire schema and onto a catalogue row read
 * back from the database, neither of which can promise a key per locale.
 */
export type Names = Record<string, string>

type Db = DrizzleD1Database<typeof schema>

/** The default field. Only `name` is localized today; the column generalises. */
const NAME = "name"

/**
 * Names for many records at once, keyed by record id.
 *
 * Batched deliberately: a list endpoint that resolved names per row would issue
 * one query per event, which is the classic N+1 and shows up as soon as the
 * discover page has more than a handful of events on it.
 */
export async function readNames(db: Db, table: string, ids: string[]): Promise<Map<string, Names>> {
  const byId = new Map<string, Names>()
  if (ids.length === 0) return byId

  const rows = await db
    .select()
    .from(schema.translation)
    .where(
      and(
        eq(schema.translation.tableName, table),
        eq(schema.translation.fieldName, NAME),
        inArray(schema.translation.recordKey, ids),
      ),
    )
    .all()

  for (const row of rows) {
    const entry = byId.get(row.recordKey) ?? {}
    entry[row.localeCode] = row.value
    byId.set(row.recordKey, entry)
  }
  return byId
}

/** Names for one record. */
export async function readName(db: Db, table: string, id: string): Promise<Names> {
  return (await readNames(db, table, [id])).get(id) ?? {}
}

/**
 * Replace a record's names.
 *
 * Delete-then-insert rather than upsert-per-locale, so dropping a translation
 * actually drops it: a client that sends `{ en: "..." }` after previously
 * sending `{ en, th }` means the Thai name is gone, not stale.
 *
 * Empty and whitespace-only values are discarded rather than stored — an empty
 * string in the catalogue renders as a blank name, which is worse than falling
 * back to English.
 */
export async function writeNames(db: Db, table: string, id: string, names: Names): Promise<void> {
  await deleteNames(db, table, id)

  const rows = LOCALES.flatMap((locale) => {
    const value = names[locale]?.trim()
    return value
      ? [{ tableName: table, recordKey: id, fieldName: NAME, localeCode: locale, value }]
      : []
  })
  if (rows.length) await db.insert(schema.translation).values(rows)
}

/** Drop a record's names. Call it when the record itself is deleted. */
export async function deleteNames(db: Db, table: string, id: string): Promise<void> {
  await db
    .delete(schema.translation)
    .where(
      and(
        eq(schema.translation.tableName, table),
        eq(schema.translation.fieldName, NAME),
        eq(schema.translation.recordKey, id),
      ),
    )
}

/**
 * The pivot value to store on the row, given a `names` map.
 *
 * English is required by the pivot column being NOT NULL. Falling back to the
 * first supplied language rather than rejecting keeps a Thai-only submission
 * working — the row is still readable, just not in English.
 */
export function pivot(names: Names): string | undefined {
  return names.en?.trim() || LOCALES.map((l) => names[l]?.trim()).find(Boolean)
}
