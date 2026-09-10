import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { authOptions } from "./auth.config"
import * as schema from "./db/schema"

/**
 * Module-level auth instance that exists solely for the Better Auth CLI.
 *
 * The runtime instance is built per request by `createAuth(c)` and needs the D1
 * binding off the Hono Context, which the CLI cannot supply. Schema generation
 * only reads `auth.options` — plugins and field definitions — and never opens a
 * connection, so an adapter with no live database is sufficient here.
 *
 * Consumed by `bun scripts/ops/auth-schema.ts --write`, which regenerates
 * `src/db/schema.ts`. Do not import this from application code.
 */
export const auth = betterAuth({
  ...authOptions,
  // An empty object, not `null`: the adapter reads `db._?.schema` at
  // construction since @better-auth/drizzle-adapter 1.7.2, and `null._` throws
  // before the optional chain can help. Nothing is ever queried through it.
  database: drizzleAdapter({} as never, { provider: "sqlite", schema }),
})
