import { admin } from "better-auth/plugins/admin"

/**
 * Auth options that determine the **database shape**.
 *
 * Kept apart from `createAuth` so the Better Auth CLI can read them without a
 * Hono Context. `src/db/schema.ts` is generated from these by
 * `mise run auth:schema:generate` — it is not hand-maintained.
 *
 * Anything that adds or changes tables/columns (plugins, extra user fields,
 * emailAndPassword) belongs here. Per-request concerns — secret, baseURL,
 * trustedOrigins, the D1 binding — stay in `createAuth`, because they have no
 * bearing on the schema.
 */
export const authOptions = {
  basePath: "/api/auth",
  emailAndPassword: {
    enabled: true,
  },
  plugins: [admin()],
}
