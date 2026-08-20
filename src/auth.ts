import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { drizzle } from "drizzle-orm/d1"
import type { Context } from "hono"
import type { AppEnv } from "./types"
import { authOptions } from "./auth.config"
import * as schema from "./db/schema"

export function createAuth(c: Context<AppEnv>) {
  const db = drizzle(c.env.DB, { schema })

  // Trust the origin the request actually arrived on, rather than a hardcoded
  // list. The Worker answers on several hostnames — localhost in dev, the
  // custom domain in production — and a fixed list cannot cover them all.
  //
  // Specifically: once wrangler.toml declares a [[routes]] custom_domain,
  // `wrangler dev` simulates that route locally. It rewrites c.req.url, Host,
  // Origin and Referer to the custom domain but keeps the **http** scheme, so
  // a request to localhost:8787 reaches the Worker as
  // http://remy.ubuntusoftware.net — which never matches the https baseURL.
  // That mismatch 403s every cookie-bearing sign-in with INVALID_ORIGIN.
  //
  // This is safe because the GUI is served from this same Worker (see the
  // [assets] block in wrangler.toml), so a same-origin request is by
  // definition first-party — which is exactly what the check is protecting.
  const requestOrigin = new URL(c.req.url).origin

  return betterAuth({
    // Schema-shaping options live in auth.config.ts so the Better Auth CLI can
    // read them without a request Context — see `mise run auth:schema:generate`.
    ...authOptions,
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    secret: c.env.BETTER_AUTH_SECRET,
    baseURL: c.env.BETTER_AUTH_URL,
    // baseURL's own origin is added automatically by Better Auth.
    trustedOrigins: [requestOrigin],
  })
}
