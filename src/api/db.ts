/**
 * The database handle, and its type.
 *
 * Its own module to break a cycle: `base.ts` imports the relation resolver, and
 * `relations.ts` needs `Db` to type its parameter — so the two imported each
 * other. TypeScript allowed it because one side was `import type`, which erases,
 * and nothing complained. `mise run check:deps` does now.
 *
 * A type both sides need belongs under both, not inside one of them.
 */

import { drizzle } from "drizzle-orm/d1"
import * as schema from "../db/schema"
import type { Bindings } from "../types"

export const database = (env: Bindings) => drizzle(env.DB, { schema })

export type Db = ReturnType<typeof database>
