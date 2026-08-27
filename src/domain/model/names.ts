/**
 * Display names, keyed by locale.
 *
 * The whole localisation story is this type plus one JSON column: no
 * translation table, no `nameTh` field. Every row carries an `en` pivot, so a
 * name always renders.
 */
export type Names = Partial<Record<string, string>>
