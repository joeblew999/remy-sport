import type { BetterAuthOptions } from "better-auth"
import { admin } from "better-auth/plugins/admin"
import { organization } from "better-auth/plugins/organization"
import { emailOTP } from "better-auth/plugins/email-otp"
import { orgAc, orgRoles } from "./auth/org-access-control"
import { adminAc, adminRoles } from "./auth/admin-access-control"

/**
 * Per-request collaborators the options need but the CLI cannot supply.
 *
 * `sendInvitationEmail` is the awkward one: it is not schema-shaping, so by the
 * rule below it does not belong here — but it is an *option of the organization
 * plugin*, and the plugin is constructed here, so there is nowhere else to put
 * it. It also needs `env` (the EMAIL binding, the base URL) which only exists
 * per request.
 *
 * Hence a factory. The CLI calls `buildAuthOptions()` with no deps and gets
 * exactly the same tables; `createAuth` calls it with a mailer. Duplicating the
 * `organization({...})` block in auth.ts instead would have meant two copies of
 * the schema-shaping config drifting apart, which is what ADR 006 §9e exists to
 * prevent.
 */
export interface AuthDeps {
  sendInvitationEmail?: (data: {
    id: string
    email: string
    role: string
    organization: { name: string }
    inviter: { user: { name?: string | null; email: string } }
  }) => Promise<void>
  /** The one-time code itself. There is no URL, and deliberately so. */
  sendVerificationOTP?: (data: {
    email: string
    otp: string
    type: "sign-in" | "email-verification" | "forget-password" | "change-email"
  }) => Promise<void>
  /**
   * Overrides code generation. Exists so the Playwright suite can sign in
   * against a *deployed* Worker, where there is no dev outbox to read the code
   * from — see auth.ts for the scope limits on that.
   */
  generateOTP?: (data: { email: string }) => string
  /**
   * Which organization a new session starts in. Needs a database read, so it
   * cannot live here — see the factory note above.
   */
  resolveActiveOrganizationId?: (userId: string) => Promise<string | null>
}

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
export function buildAuthOptions(deps: AuthDeps = {}) {
  return {
    basePath: "/api/auth",
    // Passwords are gone (ADR 012). Off, not merely deprecated: the endpoints
    // stop existing, nothing writes `account.password`, and no UI collects one.
    // Leaving this enabled beside OTP would keep a second, weaker way in — the
    // exact thing the change exists to remove.
    //
    // A separate `emailVerification` block is gone too, and not by oversight:
    // possession of the emailed code *is* the verification, so a second
    // "confirm your address" mail would verify nothing that sign-in did not.
    emailAndPassword: {
      enabled: false,
    },

    session: {
      // 30 days, not Better Auth's default 7.
      //
      // Re-authenticating costs more than it used to: a password lives in a
      // manager and autofills, a code costs a round trip through an inbox. A
      // 7-day window would put that tax on a coach every week. Sessions renew
      // on use, so an active user is never asked again.
      expiresIn: 60 * 60 * 24 * 30,
      // Slide the expiry when a session is more than a day old, so ordinary use
      // keeps someone signed in indefinitely without rewriting the row on every
      // request.
      updateAge: 60 * 60 * 24,

      /**
       * Signed session data in the cookie, so a page load costs one D1 lookup
       * instead of one per procedure it calls.
       *
       * 15 minutes, not the "hours" a longer window would allow, because of
       * what this platform does with roles: ADR 013 gives admins ban and
       * impersonation, and `tests/authz.spec.ts` drives a six-role matrix.
       * better-auth 1.7.1 revokes the cache on the admin paths that change a
       * permission or ban a user, so those take effect immediately — but the
       * window still bounds anything changed by a route NOT on that list, and
       * that is where the next such bug comes from.
       *
       * Requires the exact pin in package.json: 1.6.x fixed `getCookieCache`
       * returning stale data for an expired cache cookie, and made admin
       * changes take effect immediately with the cache on. A floating range
       * could drift under a cache whose invalidation semantics it defines.
       */
      cookieCache: { enabled: true, maxAge: 60 * 15 },
    },

    /**
     * `bizId` bridges to the Product Owner's fixtures.
     *
     * Better Auth generates its own user ids, so a fixture row naming
     * `usr_coach_001` has nothing to join against once seeded. Carrying the
     * fixture id lets the seeder — and every relationship row that names a
     * user — resolve one to the other. Same job `slug` does for organisations,
     * and null for anyone who signs up for real.
     */
    user: {
      additionalFields: {
        bizId: { type: "string", required: false },
      },
    },

    databaseHooks: {
      session: {
        create: {
          // Populate session.active_organization_id so a signed-in user has an
          // org context without the client having to choose one. ADR 009 left
          // this as a follow-up: the column existed and nothing ever wrote it,
          // so a coach belonging to a school had no current school.
          //
          // Returns undefined for users in no organization, which is most of
          // them — spectators never join one.
          before: async (session) => {
            const activeOrganizationId = deps.resolveActiveOrganizationId
              ? await deps.resolveActiveOrganizationId(session.userId)
              : null
            return { data: { ...session, activeOrganizationId: activeOrganizationId ?? undefined } }
          },
        },
      },
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
      // Passwordless sign-in. `disableSignUp` stays false, so a first-time
      // address that proves it can receive a code gets an account — which is
      // the whole point of passwordless, and is why the user.create hook below
      // assigning a default role matters more than ever.
      emailOTP({
        sendVerificationOTP:
          deps.sendVerificationOTP ??
          // The CLI builds these options with no deps. It never serves a
          // request, so this is unreachable there; throwing beats a silent
          // no-op if it ever is reached.
          (async () => {
            throw new Error("emailOTP: no sendVerificationOTP configured")
          }),
        ...(deps.generateOTP ? { generateOTP: deps.generateOTP } : {}),
        otpLength: 6,
        // 10 minutes. Long enough to survive a slow inbox, short enough that a
        // code left in a mailbox is not a standing credential.
        expiresIn: 600,
        // Codes are hashed at rest. The default is "plain", which would put a
        // working credential in the verification table in clear text — the same
        // objection as storing a password.
        storeOTP: "hashed",
        allowedAttempts: 3,
      }),
      // adminAc/adminRoles, NOT the platform ac/roles — same correction ADR 009
      // made for organization(), for the same reason. Handing the plugin the
      // domain roles replaced its own, so the seeded admin had none of its
      // permissions and every admin endpoint answered "You are not allowed to
      // list users". The domain roles are still enforced, by
      // require-permission.ts, against the domain statements; this is a
      // separate vocabulary (see admin-access-control.ts).
      admin({
        ac: adminAc,
        roles: adminRoles,
        defaultRole: "spectator",
        adminRoles: ["admin"],
      }),
      // Organization membership roles (owner/admin/member) are Better Auth's own
      // and are distinct from the six domain roles: a user has exactly one
      // platform role and may additionally belong to organizations.
      //
      // This table is also the domain's "organising body" — biz calls it `orgs`
      // (schools, clubs, federations) and hangs `teams.org_id` off it. They are
      // the same noun: the school a coach belongs to is the school its teams play
      // for, so modelling them separately would mean two org tables that must be
      // kept in step by hand. The extra columns below are the canonical `orgs`
      // fields from remy-sport-biz/domain/model/schema.md (ADR 008).
      //
      // Declared here rather than bolted on in a migration so the generated
      // src/db/auth-schema.ts knows about them — a hand-added column Better Auth
      // cannot see is exactly the drift `auth:schema:check` exists to catch.
      organization({
        // orgAc/orgRoles, NOT the platform ac/roles. Passing the six domain roles
        // here made "owner" — the role createOrganization actually writes —
        // resolve to nothing. See org-access-control.ts and ADR 009.
        ac: orgAc,
        roles: orgRoles,
        // Org membership grouping. See ADR 009 for why these are `orgTeam` and
        // not `team`, and why rosters cannot live here.
        teams: { enabled: true },
        // Undefined when the caller supplied no mailer (the CLI). Better Auth
        // then simply creates the invitation row and sends nothing, which is
        // the pre-ADR-010 behaviour.
        sendInvitationEmail: deps.sendInvitationEmail,
        // Lets an org define extra roles at runtime, on top of the six fixed
        // domain roles. Additive — the `ac` above is still the base statement
        // set, and a dynamic role can only ever grant a subset of it.
        dynamicAccessControl: { enabled: true },
        schema: {
          organization: {
            // No additionalFields, deliberately.
            //
            // `names`, `orgTypeCode`, `cityCode` and `provinceCode` lived here
            // and were the PO's model stored inside an auth library's table.
            // additionalFields has no JSON type, so `names` — a JSON column by
            // design since migration 0010 — was a string that src/api/teams.ts
            // parsed by hand. They are columns on the generated `org` table now.
            // Better Auth keeps id, name and slug, which is all its plugin
            // needs.
          },
          // `team` is already taken by the domain roster table (migration 0006,
          // ADR 008). Both tables are real and both are needed; renaming the
          // plugin's avoids an ambiguous `export *` through src/db/schema.ts and
          // a CREATE TABLE that would hit the existing roster table.
          team: { modelName: "orgTeam" },
          teamMember: { modelName: "orgTeamMember" },
        },
      }),
    ],
    // `satisfies`, not a type annotation: an annotation would widen the plugins
    // array and `createAuth` spreads this object, so Better Auth would lose the
    // per-plugin endpoint types — `auth.api.createUser` would stop existing.
  } satisfies BetterAuthOptions
}

/**
 * The dependency-free options. This is what `src/auth.cli.ts` feeds the Better
 * Auth CLI, and therefore what `auth-schema.ts` is generated from. Nothing in
 * `deps` shapes the schema, so this and the runtime instance always agree on
 * tables.
 */
export const authOptions = buildAuthOptions()
