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
