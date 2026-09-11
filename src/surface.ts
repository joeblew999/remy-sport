/**
 * The whole server surface, as data.
 *
 * `src/index.ts` iterates this in order and owns no prefix of its own; assets
 * then the shell are the only fallthrough. Everything under a prefix is an
 * oRPC procedure, and every procedure declares its own policy — that half is
 * proved by the router walk in tests/repo/authz.test.ts.
 *
 * Data rather than a chain of `if (pathname.startsWith(...))`, because the rule
 * this replaces read Hono's route table and would have passed over an empty set
 * the moment Hono was deleted. `POST /api/seed` was an unauthenticated write on
 * a public domain for months because nothing enumerated it. An array cannot
 * quietly become empty: tests/repo/http-surface.test.ts asserts against it, and
 * a new prefix without a guard sentence is a failure rather than a silence.
 */

export interface SurfaceEntry {
  /** Matched with `startsWith`, most specific first. */
  readonly prefix: string
  /** Which handler answers. Named in the dispatch in src/index.ts. */
  readonly owner: "better-auth" | "orpc-rpc" | "orpc-openapi"
  /**
   * How requests here are authorised, in a sentence.
   *
   * The written justification the old HONO_ROUTES map required. It is asserted
   * non-empty, so a prefix cannot be added without saying what guards it.
   */
  readonly guard: string
}

export const SURFACE: readonly SurfaceEntry[] = [
  {
    prefix: "/api/auth/",
    owner: "better-auth",
    guard: "Better Auth's own CSRF and session handling",
  },
  {
    prefix: "/rpc",
    owner: "orpc-rpc",
    guard: "SimpleCsrfProtectionHandlerPlugin + authed base builder",
  },
  {
    prefix: "/api",
    owner: "orpc-openapi",
    guard: "authedRoute security schemes",
  },
] as const
