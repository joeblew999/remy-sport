import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { admin } from "better-auth/plugins/admin"
import { bearer } from "better-auth/plugins/bearer"
import { apiKey } from "better-auth/plugins"
import { drizzle } from "drizzle-orm/d1"
import type { Context } from "hono"
import type { AppEnv } from "./types"
import * as schema from "./db/schema"

export function createAuth(c: Context<AppEnv>) {
  const db = drizzle(c.env.DB, { schema })

  return betterAuth({
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    secret: c.env.BETTER_AUTH_SECRET,
    baseURL: c.env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    trustedOrigins: ["http://localhost:8787"],
    emailAndPassword: {
      enabled: true,
    },
    plugins: [
      admin(),
      bearer(),
      apiKey(),
    ],
  })
}
