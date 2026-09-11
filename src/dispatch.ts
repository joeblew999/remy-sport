/**
 * The whole server surface, as data: which handler owns which prefix.
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
 * quietly become empty: tests/repo/dispatch.test.ts asserts against it, and a
 * new prefix without a guard sentence is a failure rather than a silence.
 *
 * Named `dispatch`, not `surface`: `surface` already means the deployment a
 * smoke run is pointed at (scripts/deploy/smoke.ts) and a page a reader looks
 * at (tests/helpers/surfaces.ts). A third meaning would be misread.
 */

/**
 * **This table declares order and ownership. The handlers decide matches.**
 *
 * `index.ts` iterates in order, calls each owner's handler, and takes the first
 * that answers `matched: true`. It must NOT test `pathname.startsWith(prefix)`
 * itself and then assume that owner will answer — `/api/auth/` and `/api`
 * overlap, so a prefix test would hand every Better Auth request to the
 * OpenAPI handler, which would then 404 it rather than falling through.
 *
 * oRPC's handlers already do this correctly: `handle(request, { prefix })`
 * returns `{ matched: false }` for anything the router does not own, which is
 * the signal to try the next entry. The `prefix` field below is what gets
 * passed to them, and what the repo test matches on — not a runtime matcher.
 */
export interface DispatchEntry {
  /** Passed to the owner's handler; ordered most specific first. */
  readonly prefix: `/${string}`
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

export const DISPATCH: readonly DispatchEntry[] = [
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
