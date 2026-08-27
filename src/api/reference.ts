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
import type { z } from "zod"
import { ReferenceSchema } from "../domain/api"
import { VOCABULARY_ORDER, VOCABULARY_TABLES } from "../db/vocabularies-schema"
import { pub } from "./base"

export const list = pub
  .route({
    method: "GET",
    path: "/reference",
    summary: "Controlled vocabularies, as the Product Owner defines them",
  })
  .output(ReferenceSchema)
  .handler(async ({ context: { db } }) => {
  // Ordered by `sort` where the fixture has one, so the PO controls dropdown
  // order by ordering the model — sorting by code gives OPEN, SENIOR, U10, U12…
  // Provinces and cities have no curated order and go by name.
  const entries = await Promise.all(
    Object.entries(VOCABULARY_TABLES).map(async ([key, table]) => [
      key,
      await db
        .select()
        .from(table)
        .orderBy(asc(VOCABULARY_ORDER[key as keyof typeof VOCABULARY_ORDER]))
        .all(),
    ]),
  )
  // The cast is the one seam: `Object.entries` erases the key literals that
  // make this endpoint typed. The contract still validates the result at
  // runtime, so a mismatch fails the request rather than reaching a client.
  return Object.fromEntries(entries) as z.infer<typeof ReferenceSchema>
})
