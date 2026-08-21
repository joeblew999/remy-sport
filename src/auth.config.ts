import type { BetterAuthOptions } from "better-auth"
import { admin } from "better-auth/plugins/admin"
import { organization } from "better-auth/plugins/organization"
import { ac, roles } from "./auth/access-control"

/**
 * Auth options that determine the **database shape**.
 *
 * Kept apart from `createAuth` so the Better Auth CLI can read them without a
 * Hono Context. `src/db/auth-schema.ts` is generated from these by
 * `mise run auth:schema:generate` — it is not hand-maintained.
 *
 * Anything that adds or changes tables/columns (plugins, extra user fields,
 * emailAndPassword) belongs here. Per-request concerns — secret, baseURL,
 * trustedOrigins, the D1 binding — stay in `createAuth`, because they have no
 * bearing on the schema.
 *
 * See ADR 007 for the access-control wiring and the organization plugin.
 */
export const authOptions = {
  basePath: "/api/auth",
  emailAndPassword: {
    enabled: true,
  },

  databaseHooks: {
    user: {
      create: {
        // Role assignment belongs to Better Auth, not to a raw UPDATE against
        // its own table (which is what seed.ts used to do — ADR 007 §3).
        //
        // The default matters: without it Better Auth assigns its generic
        // "user", which matches no role in access-control.ts, so
        // require-permission.ts denied every request from an account created
        // outside the seed route. "spectator" is the biz model's read-only
        // follower.
        // `role` is contributed by the admin plugin, so it is not on the base
        // User type — hence the widening cast.
        before: async (user) => {
          const u = user as typeof user & { role?: string }
          return { data: { ...u, role: u.role ?? "spectator" } }
        },
      },
    },
  },

  plugins: [
    // ac/roles must be passed, or the plugin runs its own default admin/user
    // model and knows nothing about organizer, coach, player, spectator or
    // referee — leaving Better Auth and require-permission.ts disagreeing
    // about the same question.
    admin({ ac, roles, defaultRole: "spectator", adminRoles: ["admin"] }),
    // Organization membership roles (owner/admin/member) are Better Auth's own
    // and are distinct from the six domain roles: a user has exactly one
    // platform role and may additionally belong to organizations.
    organization({ ac, roles }),
  ],
  // `satisfies`, not a type annotation: an annotation would widen the plugins
  // array and `createAuth` spreads this object, so Better Auth would lose the
  // per-plugin endpoint types — `auth.api.createUser` would stop existing.
} satisfies BetterAuthOptions
