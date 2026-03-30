export type Bindings = {
  DB: D1Database
  STORAGE: R2Bucket
  BETTER_AUTH_SECRET: string
  BETTER_AUTH_URL: string
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
