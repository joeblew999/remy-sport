export type Bindings = {
  DB: D1Database
  STORAGE: R2Bucket
  ASSETS: Fetcher
  BETTER_AUTH_SECRET: string
  BETTER_AUTH_URL: string
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
  // Set by requireOrgMember once membership is established, so a handler can
  // branch on owner/admin/member without re-querying. Absent on routes that
  // never ran that middleware.
  orgRole?: string
}

export type AppEnv = {
  Bindings: Bindings
  Variables: Variables
}
