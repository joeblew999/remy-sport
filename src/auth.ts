import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { SEED_ENTITIES } from "../src/domain/model/entities"
import { drizzle } from "drizzle-orm/d1"
import { eq } from "drizzle-orm"
import type { Bindings } from "./types"
import { buildAuthOptions } from "./auth.config"
import { mailerFor, usesOutbox } from "./mail/mailer"
import { LOCALES, type ReleasedLocale } from "./domain/vocabularies"
import { FALLBACK } from "./domain/names"
/**
 * The product's own copy, compiled by Paraglide — the same messages the SPA
 * renders, so an email and a page cannot word the same thing differently.
 *
 * Straight from the generated module rather than through `src/web/lib/i18n`:
 * that wrapper also exports the SPA's locale runtime, and the Worker must not
 * depend on src/web. Sending this mail is what showed the messages were never
 * the SPA's to own, which is why they compile to src/paraglide now.
 *
 * Safe in a Worker: the runtime guards every browser global behind
 * `typeof window !== "undefined"`, and every call here passes `options.locale`
 * explicitly, so `getLocale()` — the part that would look for a document — is
 * never reached.
 */
import { m } from "./paraglide/messages.js"
import * as schema from "./db/schema"

/** The fixtures' people. A fixed code only ever applies to one of these. */
const SEEDED_EMAILS: ReadonlySet<string> = new Set<string>(
  SEED_ENTITIES.users.map((u) => u.email),
)

/**
 * The seeded admin, which is the one account a fixed code must not reach on a
 * deployment.
 *
 * A fixed code is a published credential — it is in the repo, and where the
 * demo picker is enabled it is on the page — so the only question is what
 * someone can do with it. For a coach, organiser, referee, player or spectator:
 * act within seeded fixture data, which is what a demo is for.
 *
 * The admin is different in kind. That account holds Better Auth's admin plugin
 * — ban, set-role, and **impersonate** — and impersonation is the one power
 * that reaches a real person's account. So on a deployment it signs in the
 * ordinary way, through a real inbox, and the demo picker never lists it.
 *
 * Where mail is captured rather than sent, the exclusion buys nothing and costs
 * the test suite its admin coverage: an outbox is only readable by whoever is
 * running the Worker. So it applies exactly where the risk does.
 */
const ADMIN_EMAILS: ReadonlySet<string> = new Set<string>(
  SEED_ENTITIES.users.filter((u) => u.roleCode === "ADMIN").map((u) => u.email),
)

/**
 * Structurally typed, not `Context<AppEnv>`.
 *
 * It only ever reads `env` and `req.url` (verified against the body below), and
 * oRPC procedures have no Hono context to hand it — `authed` in
 * src/api/base.ts resolves the session from the raw Request. Narrowing the
 * parameter to what is actually used lets both callers pass what they have.
 *
 * `headers` is the third thing it reads, and it is optional because not every
 * caller has a request: `src/auth.cli.ts` builds an instance for the Better
 * Auth CLI, which never serves one. Without headers the mail falls back to the
 * base locale, which is what it did before this existed.
 */
export type AuthHost = {
  env: Bindings
  req: { url: string }
  /**
   * The incoming request's headers.
   *
   * `Accept-Language` for the OTP email's locale, and `x-forwarded-proto` for
   * the scheme the reader actually used — see the note in `createAuth`. Still
   * one field rather than the whole Hono Context: what is needed is headers,
   * and taking the Context would make this depend on the web framework.
   */
  headers?: Headers
  /**
   * Cloudflare's edge data for this request, when there is any.
   *
   * `request.cf` rather than headers: Cloudflare sends `cf-ipcountry` but there
   * is no `cf-city` or `cf-region` header — city, region and the network name
   * live only on this object. Absent under `wrangler dev` and in the test pool,
   * and absent is a real answer: a session with no place recorded beats one
   * with a place invented.
   */
  cf?: { city?: string; country?: string; region?: string; asOrganization?: string }
}

/**
 * The reader's language, from the browser that asked for the code.
 *
 * `Accept-Language` is the only signal available at this point: the OTP is
 * requested before anyone is signed in, so there is no account to carry a
 * preference and no session to read one from. It is the browser's own setting,
 * which is exactly the question being asked.
 *
 * Quality values are honoured rather than taking the first tag, because
 * `en;q=0.5,th;q=0.9` means Thai and reading left to right would answer
 * English. Region is dropped — `th-TH` is Thai — and anything the product does
 * not offer is skipped, so a reader whose browser prefers French gets the base
 * locale rather than nothing.
 */
function localeFrom(headers: Headers | undefined): ReleasedLocale {
  const header = headers?.get("accept-language")
  // FALLBACK is typed against every declared locale, including drafts; an email
  // must go out in one the product actually offers.
  const base = FALLBACK as ReleasedLocale
  if (!header) return base

  const offered = LOCALES as readonly string[]
  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";")
      const q = params.find((x) => x.trim().startsWith("q="))
      return {
        // `th-TH` and `TH` are both Thai.
        tag: (tag ?? "").trim().toLowerCase().split("-")[0] ?? "",
        // A tag with no `q` is q=1, which is what makes it win by default.
        q: q ? Number.parseFloat(q.split("=")[1] ?? "0") : 1,
      }
    })
    .filter((x) => x.tag && Number.isFinite(x.q))
    .sort((a, b) => b.q - a.q)

  return (ranked.find((x) => offered.includes(x.tag))?.tag as ReleasedLocale) ?? base
}

export function createAuth(c: AuthHost) {
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
  /**
   * The scheme the *browser* used, which is not always the one the Worker sees.
   *
   * Behind the dev tunnel, cloudflared terminates TLS and forwards plain http
   * to the local server, and `wrangler dev --host` rewrites the Host on top of
   * that — so `c.req.url` arrives as `http://192.168.1.100` for a request the
   * reader made to `https://dev-remy.ubuntusoftware.net`. Believing it means
   * Better Auth issues a non-secure cookie over a genuinely secure connection.
   *
   * `x-forwarded-proto` is what a reverse proxy sets for exactly this, and
   * Cloudflare sends `cf-visitor` saying the same thing. Either is more
   * truthful than the URL once a proxy is in front.
   *
   * Only the scheme is taken from headers. The host is left as the Worker sees
   * it, because these cookies carry no `Domain` — they are host-only, so the
   * browser scopes them to the name it asked for and the internal rewrite does
   * not reach it.
   */
  const forwardedScheme = (() => {
    const proto = c.headers?.get("x-forwarded-proto")?.split(",")[0]?.trim()
    if (proto === "https" || proto === "http") return proto
    try {
      const visitor = c.headers?.get("cf-visitor")
      if (visitor) {
        const scheme = (JSON.parse(visitor) as { scheme?: string }).scheme
        if (scheme === "https" || scheme === "http") return scheme
      }
    } catch {
      // A malformed cf-visitor is not worth failing a request over.
    }
    return null
  })()

  const requestUrl = new URL(c.req.url)
  if (forwardedScheme) requestUrl.protocol = `${forwardedScheme}:`
  const requestOrigin = requestUrl.origin

  const mailer = mailerFor(c.env)

  return betterAuth({
    // Schema-shaping options live in auth.config.ts so the Better Auth CLI can
    // read them without a request Context — see `mise run auth:schema:generate`.
    //
    // Built through the factory rather than spread as a constant, because
    // sendInvitationEmail needs `env` — the EMAIL binding and the base URL —
    // which exists only per request. Nothing passed here changes the schema.
    ...buildAuthOptions({
      /**
       * The PO's user lifecycle, read straight off the row.
       *
       * One indexed lookup on the primary key, once per session creation — not
       * per request, which is what makes it affordable at the chokepoint every
       * way in must pass through.
       */
      userStatus: async (userId: string) => {
        const row = await db
          .select({ statusCode: schema.user.statusCode })
          .from(schema.user)
          .where(eq(schema.user.id, userId))
          .get()
        return row?.statusCode ?? null
      },
      /**
       * Where this session is starting, for the devices page.
       *
       * Captured at creation because that is the question being asked — "where
       * was this signed in from" — not "where is that IP now". Cloudflare has
       * already resolved it at the edge, so there is no lookup, no geo-IP
       * database and no third party in the path.
       */
      /**
       * Local dev shows ONE place for everybody, and that is miniflare, not a
       * bug here. It fetches Cloudflare's geo data once per machine into
       * `node_modules/.mf/cf.json` and serves that blob to every request — so
       * two phones in two countries both report whatever this laptop was when
       * the file was written. The IP stays live because it comes from a header,
       * which is what makes the mismatch visible: a Thai address beside an
       * Australian city meant the cache was stale from a VPN session hours
       * earlier. `rm node_modules/.mf/cf.json` and restart to refresh it.
       *
       * On the edge it is resolved per request and is correct.
       */
      sessionPlace: () => ({
        city: c.cf?.city,
        country: c.cf?.country,
        // `asOrganization` is the network's name — "AIS Fibre", "TrueMove H" —
        // which is what makes a row recognisable to a person. The AS number
        // beside it would not.
        network: c.cf?.asOrganization,
      }),
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
        const url = `${base}/#/accept-invitation/${id}`
        const invitedBy = inviter.user.name || inviter.user.email
        /**
         * English, explicitly.
         *
         * `Accept-Language` on *this* request is the inviter's browser, and the
         * mail is going to somebody else — so it says nothing about the person
         * who will read it. Guessing from it would be worse than not guessing.
         * Their own preference is knowable once they have an account; until
         * then the base locale is the honest answer.
         */
        const args = { locale: FALLBACK } as const
        await mailer.send({
          to: email,
          subject: m.email_invite_subject({ invitedBy, org: organization.name }, args),
          text: m.email_invite_body({ invitedBy, org: organization.name, url }, args),
        })
      },

      // No URL here, unlike every other mail this app sends: a code the user
      // retypes cannot be turned into a one-click link, which is the point.
      // A link in an inbox is a bearer credential that survives forwarding.
      sendVerificationOTP: async ({ email, otp, type }) => {
        /**
         * The browser that asked for the code is the one about to read it, so
         * `Accept-Language` on this request is a real signal — unlike on the
         * invitation above, where the recipient is somebody else.
         */
        const args = { locale: localeFrom(c.headers) } as const
        const purpose =
          type === "sign-in"
            ? m.email_otp_purpose_sign_in({}, args)
            : type === "email-verification"
              ? m.email_otp_purpose_verify_email({}, args)
              : type === "change-email"
                ? m.email_otp_purpose_change_email({}, args)
                : m.email_otp_purpose_other({}, args)
        await mailer.send({
          to: email,
          subject: m.email_otp_subject({ otp }, args),
          text: m.email_otp_body({ otp, purpose }, args),
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
      // Scope is the mitigation, and it is two-layered: TEST_OTP must be set
      // explicitly, and it only ever applies to seeded addresses that are not
      // the admin. Real addresses always get a random code, and so does the
      // seeded admin — see DEMO_EMAILS for why that one is different in kind.
      //
      // Keyed on the seeded set rather than a domain, because the PO's people
      // are at their own schools and federations and there is no one demo
      // domain to match on. Strictly narrower than what it replaced: seed.ts
      // once committed working passwords for these same accounts.
      //
      // Still unset this before the platform has real users. A demo account
      // cannot reach anyone else's data, but it can edit shared fixture data,
      // and once real events exist those are not fixtures any more.
      ...(c.env.TEST_OTP
        ? {
            generateOTP: ({ email }: { email: string }) =>
              SEEDED_EMAILS.has(email) && !(ADMIN_EMAILS.has(email) && !usesOutbox(c.env))
                ? c.env.TEST_OTP!
                : String(crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000).padStart(6, "0"),
          }
        : {}),

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
    advanced: {
      database: { joins: true },
      // Cloudflare puts the real client IP in CF-Connecting-IP. Better Auth's
      // default list does not include it, so every session row recorded an
      // empty ipAddress — which matters now that ADR 014 shows those rows to
      // users as "your devices": an entry with no location and no address is
      // not something anyone can act on.
      //
      // CF-Connecting-IP first because Cloudflare sets it and strips any
      // client-supplied copy; x-forwarded-for is kept after it for local dev
      // and any non-Cloudflare path.
      ipAddress: {
        ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for", "x-real-ip"],
      },
    },
    secret: c.env.BETTER_AUTH_SECRET,
    /**
     * The origin this request arrived on, not the pinned production URL.
     *
     * There are three now — localhost, the dev tunnel, and production — and
     * `baseURL` decides the session cookie's shape. Pinned to
     * `https://remy.ubuntusoftware.net`, Better Auth saw https everywhere and
     * always issued a `__Secure-` prefixed cookie. A browser refuses to store
     * one of those over plain http, so signing in on http://localhost returned
     * 200 with a token and then had no session — visible in WebKit, hidden in
     * Chromium, which is why 35 passing e2e tests never showed it.
     *
     * Derived, it is correct in all three: http on localhost gets a plain
     * cookie, both https origins get a secure one. This is the same reasoning
     * that already governs `trustedOrigins` directly below, and the opposite of
     * the invite email above — that one keeps BETTER_AUTH_URL on purpose,
     * because a link in somebody's inbox outlives the request that sent it.
     * A cookie does not.
     *
     * BETTER_AUTH_URL is still the canonical address and still what emails use;
     * it is simply not what decides how a cookie is scoped.
     */
    baseURL: requestOrigin,
    // baseURL's own origin is added automatically by Better Auth.
    /**
     * The origin as the Worker sees it, plus the dev tunnel's own name.
     *
     * `wrangler dev --host` rewrites Host, so a request made to
     * `https://dev-remy.example` reaches the Worker as the LAN address and
     * `requestOrigin` is that — while the browser's `Origin` header still says
     * the tunnel. Better Auth compares the two and refuses with INVALID_ORIGIN,
     * which is what a reader saw as "Invalid origin" the moment they picked an
     * account to sign in as.
     *
     * TUNNEL_HOSTNAME is set only in `.dev.vars`, so this adds nothing in
     * production, where the Host is real and `requestOrigin` is already right.
     */
    trustedOrigins: [
      requestOrigin,
      // The raw URL's origin as well, which is not the same thing once the
      // scheme has been corrected above. Behind the tunnel `c.req.url` is
      // http://<lan-ip> while `requestOrigin` is https://<lan-ip>, and Better
      // Auth checks the request's own URL — so correcting the scheme for the
      // cookie's sake silently un-trusted the very address the request came in
      // on, and every sign-in through the tunnel 403'd with
      // "Invalid origin: http://<lan-ip>".
      new URL(c.req.url).origin,
      // And the tunnel's public name, which cannot be derived from the request
      // at all: `wrangler dev --host` has already replaced it with the LAN
      // address by the time the Worker sees anything. Set only in .dev.vars,
      // so this adds nothing in production.
      ...(c.env.TUNNEL_HOSTNAME ? [`https://${c.env.TUNNEL_HOSTNAME}`] : []),
    ],
  })
}
