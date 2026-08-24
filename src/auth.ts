import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { drizzle } from "drizzle-orm/d1"
import { eq } from "drizzle-orm"
import type { Context } from "hono"
import type { AppEnv } from "./types"
import { buildAuthOptions } from "./auth.config"
import { mailerFor } from "./mail/mailer"
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

  const mailer = mailerFor(c.env)

  return betterAuth({
    // Schema-shaping options live in auth.config.ts so the Better Auth CLI can
    // read them without a request Context — see `mise run auth:schema:generate`.
    //
    // Built through the factory rather than spread as a constant, because
    // sendInvitationEmail needs `env` — the EMAIL binding and the base URL —
    // which exists only per request. Nothing passed here changes the schema.
    ...buildAuthOptions({
      sendInvitationEmail: async ({ id, email, organization, inviter }) => {
        // The accept link points at the SPA's hash route, since /app is the
        // product surface (ADR 008). Better Auth deliberately does not build
        // this URL — only the app knows where its accept screen lives.
        //
        // BETTER_AUTH_URL, not requestOrigin: an email outlives the request
        // that sent it. requestOrigin is whatever host the invite arrived on —
        // localhost, a preview deployment, or (per the note above) the http://
        // form wrangler rewrites to locally — and any of those bake a dead link
        // into someone's inbox. The canonical URL is the only safe choice here,
        // which is the opposite of the right answer for trustedOrigins below.
        const base = c.env.BETTER_AUTH_URL ?? requestOrigin
        const url = `${base}/app#/accept-invitation/${id}`
        const invitedBy = inviter.user.name || inviter.user.email
        await mailer.send({
          to: email,
          subject: `${invitedBy} invited you to join ${organization.name} on Remy Sport`,
          text: [
            `${invitedBy} has invited you to join ${organization.name} on Remy Sport.`,
            ``,
            `Accept the invitation: ${url}`,
            ``,
            `If you were not expecting this, you can ignore this email.`,
          ].join("\n"),
        })
      },

      // No URL here, unlike every other mail this app sends: a code the user
      // retypes cannot be turned into a one-click link, which is the point.
      // A link in an inbox is a bearer credential that survives forwarding.
      sendVerificationOTP: async ({ email, otp, type }) => {
        const purpose =
          type === "sign-in"
            ? "sign in to Remy Sport"
            : type === "email-verification"
              ? "verify your email address"
              : type === "change-email"
                ? "confirm your new email address"
                : "continue"
        await mailer.send({
          to: email,
          subject: `${otp} is your Remy Sport code`,
          text: [
            `Your code is ${otp}.`,
            ``,
            `Use it to ${purpose}. It expires in 10 minutes.`,
            ``,
            `If you did not ask for this, ignore this email — nobody can use the`,
            `code without it.`,
          ].join("\n"),
        })
      },

      // Fixed code for the seeded demo accounts, and only when TEST_OTP is set.
      //
      // `mise run deploy` reruns the whole Playwright suite against the
      // deployed Worker (test:deployed), and every test signs in. Passwords
      // made that trivial; a code sent to a real inbox does not, and the dev
      // outbox deliberately does not exist in production. Without this, either
      // the suite loses its auth coverage on deploys or the app grows a way to
      // read production mail — both worse.
      //
      // Scope is the mitigation: TEST_OTP must be set explicitly, and it only
      // ever applies to @remy.dev, the seeded demo domain. Real addresses
      // always get a random code. Note this is strictly narrower than what it
      // replaces — seed.ts previously committed working passwords for these
      // same accounts to the repo. Unset TEST_OTP before the platform has real
      // users; ADR 012 records that as a launch gate.
      ...(c.env.TEST_OTP
        ? {
            generateOTP: ({ email }: { email: string }) =>
              email.endsWith("@remy.dev")
                ? c.env.TEST_OTP!
                : String(crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000).padStart(6, "0"),
          }
        : {}),

      // First organization the user belongs to, oldest first so the choice is
      // stable across sign-ins rather than depending on row order. A user in
      // several orgs can switch with the plugin's set-active-organization.
      resolveActiveOrganizationId: async (userId) => {
        const row = await db
          .select({ organizationId: schema.member.organizationId })
          .from(schema.member)
          .where(eq(schema.member.userId, userId))
          .orderBy(schema.member.createdAt)
          .get()
        return row?.organizationId ?? null
      },
    }),
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    // Fetch session+user in one query instead of two. Stable in 1.7 (it was
    // `experimental: { joins: true }` before). This is not a schema-shaping
    // option, so it belongs here rather than in auth.config.ts.
    //
    // The Drizzle adapter implements this via Drizzle's relational query API —
    // `db.query[model].findFirst({ with })` — which needs the `relations()`
    // exports that auth-schema.ts generates and schema.ts re-exports. When it
    // cannot find them it logs "Falling back to regular query" and silently
    // works anyway, so enabling the flag proves nothing on its own. Verified
    // engaged, and measured, in ADR 006 §9f.
    advanced: { database: { joins: true } },
    secret: c.env.BETTER_AUTH_SECRET,
    baseURL: c.env.BETTER_AUTH_URL,
    // baseURL's own origin is added automatically by Better Auth.
    trustedOrigins: [requestOrigin],
  })
}
