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
 * Consumed by `mise run auth:schema:generate`, which regenerates
 * `src/db/schema.ts`. Do not import this from application code.
 */
export const auth = betterAuth({
  ...authOptions,
  database: drizzleAdapter(null as never, { provider: "sqlite", schema }),
})
