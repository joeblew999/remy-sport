export type Bindings = {
  DB: D1Database
  STORAGE: R2Bucket
  ASSETS: Fetcher
  BETTER_AUTH_SECRET: string
  BETTER_AUTH_URL: string
  /**
   * The dev tunnel's hostname, local only — written into `.dev.vars` by
   * `mise run dev` and absent everywhere else.
   *
   * `wrangler dev --host` rewrites the Host the Worker sees, so a request the
   * browser made to the tunnel arrives claiming to be the LAN address. The
   * Origin header still says the truth, and the two disagreeing is an
   * INVALID_ORIGIN on every sign-in through the tunnel. This is the one name
   * that cannot be derived from the request, so it is supplied.
   */
  TUNNEL_HOSTNAME?: string
  // Apple / Android deep-link identifiers. Optional — the .well-known routes
  // 404 until these are set, so we never serve an AASA Apple would cache wrong.
  APPLE_TEAM_ID?: string
  APPLE_BUNDLE_ID?: string
  ANDROID_PACKAGE_NAME?: string
  ANDROID_CERT_FINGERPRINT?: string
  // Cloudflare Email Service. Optional because local dev and tests run the
  // `outbox` transport instead and never touch the binding (ADR 010).
  EMAIL?: SendEmail
  // "cloudflare" | "outbox". Absent means outbox — see mail/mailer.ts for why
  // the default is the safe one rather than the production one.
  MAIL_TRANSPORT?: string
  // Sender address; must belong to a domain onboarded to Email Service.
  EMAIL_FROM?: string
  /**
   * Fixed sign-in code for the addresses the fixtures seed, so the
   * Playwright suite can authenticate against a deployed Worker where no dev
   * outbox exists (ADR 012). A secret, never a [vars] entry. Unset it before
   * the platform has real users.
   */
  TEST_OTP?: string
  /**
   * Product telemetry — see src/analytics.ts.
   *
   * Optional, and that is the contract: `wrangler dev` without the binding and
   * every worker test run without it, so a missing dataset has to degrade to
   * "no telemetry" and never to a failed request.
   */
  ANALYTICS?: AnalyticsEngineDataset
  /**
   * Web Push identity — `mise run push:keys` generates the pair, and all three
   * are secrets.
   *
   * Optional together: with none of them set the app runs and simply never
   * pushes, which is what tests and a fresh clone want. src/api/push.ts checks
   * for all three rather than assuming, so a half-configured deployment sends
   * nothing instead of throwing inside whatever write triggered it.
   *
   * **Rotating the pair invalidates every existing subscription.** The public
   * key is pinned into each subscription by the browser at subscribe() time, so
   * a new key cannot sign for endpoints the old one created — they fail 403
   * until each reader re-subscribes.
   */
  /**
   * The MoQ relay for the live-video harness.
   *
   * A Worker secret rather than a literal in `index.html`, for the reason
   * Cloudflare states themselves: the token travels in the URL *path*, so it
   * lands in server access logs. Baking it into the bundle would also put it in
   * git, ship it to every visitor forever, and make rotating it a redeploy.
   *
   * Optional together. Absent, `/api/moq/config` answers null and every video
   * surface renders a notice instead of failing — which is the default state.
   */
  MOQ_RELAY_URL?: string
  /**
   * Publish + subscribe. Handed only to the broadcast surface.
   *
   * Anyone who loads that page can read it and publish — which is what the
   * harness needs and is only tolerable because nothing decides who may
   * broadcast (src/web/pages/video.tsx says why).
   */
  MOQ_RELAY_TOKEN?: string
  /**
   * Subscribe only, for watchers — who are most people.
   *
   * The whole point of the split: a token scraped from the watch page cannot
   * start a broadcast. Falls back to the publish token if unset, so a
   * deployment with one token still works rather than silently going dark.
   */
  MOQ_RELAY_TOKEN_SUBSCRIBE?: string
  VAPID_SUBJECT?: string
  VAPID_PUBLIC_KEY?: string
  VAPID_PRIVATE_KEY?: string
}

export type Variables = {
  user: {
    id: string
    email: string
    name: string | null
    emailVerified: boolean
    image?: string | null | undefined
    role?: string | null
    createdAt: Date
    updatedAt: Date
  } | null
  session: {
    id: string
    userId: string
    expiresAt: Date
  } | null
}

export type AppEnv = {
  Bindings: Bindings
  Variables: Variables
}
