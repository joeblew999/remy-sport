# Unify server routing: oRPC owns every endpoint, Hono is removed

**Status:** in progress, started 2026-09-11. One PR.
**Principle:** every endpoint is an oRPC procedure. There is no server-side router
library. `src/index.ts` is a fetch handler that dispatches by prefix to Better
Auth, oRPC and assets, and nothing else.

Do this before the notifications spec and the router migration. The router
migration's A2 (shell for every path) is subsumed by Part C.

## Corrections to the brief, found by reading the tree first

Four things the specification assumes are not quite what is there. Each changes
work, so each is settled here before any code moves.

### 1. Removing Hono silently destroys a security check

`tests/repo/authz.test.ts` has two rules. The first walks the router and proves
every procedure declares a policy — unaffected. The second reads Hono's own
route table off the exported `app` and asserts it against a hand-maintained
`HONO_ROUTES` map, so a route mounted outside the router cannot appear without a
sentence saying how it is guarded. That rule exists because `POST /api/seed` sat
unauthenticated on a public domain for months precisely because nothing listed
it.

Deleting Hono deletes `app.routes`. The check's subject vanishes and the rule
passes over an empty set — the failure mode `src/index.ts` already warns about
in its own comment: a security check silently losing its subject.

**Decision:** the non-procedure surface list moves into the new
`http-surface` test <!-- docs-check-ignore --> and is asserted against the
dispatch branches in `src/index.ts`, not against a router's route table. After
Part A the list is short — Better Auth's subtree, the asset fallback, the shell
— because everything else has become a procedure and is covered by rule one.
The second rule in `tests/repo/authz.test.ts` is deleted only when its
replacement is green, never before.

### 2. Part C's sketch drops the dead-letter queue

The brief writes `queue: handleNotification`. The real export is a local `queue`
function that handles a `-dlq` batch separately: it records a `notify.dead`
point per message and acks, because a message rotting unread in a dead-letter
queue is "notifications silently stopped". It also acks or retries per message
rather than letting a throw fail the batch.

**Decision:** `index.ts` keeps the existing `queue` function verbatim. Only the
`fetch` export changes in this PR.

### 3. Two of the packages to remove are already gone

`package.json` carries `hono` alone. There is no `@hono/zod-openapi` and no
`@hono/swagger-ui`. That line of the brief is already satisfied.

### 4. Part D is wider than the brief lists

The brief names six script files. The call sites that read these URLs also
include `scripts/e2e.ts`, `scripts/deploy.ts`, `scripts/db.ts`,
`tests/e2e/seed.setup.ts`, `tests/helpers/auth.ts`, `tests/worker/helpers.ts`,
`tests/render/crash.spec.ts` and `tests/repo/assets.test.ts`. Scope is the
grep, not the list.

### 5. The typed client is a new file, and its home contradicts the brief

Part D describes `src/api/client.ts` <!-- docs-check-ignore --> as though it
exists. It does not. The SPA's client is `src/web/lib/orpc.ts`, built on
`RPCLink` against `/rpc` — which the brief correctly leaves unchanged. The new
factory is therefore a new file over the OpenAPI link, for consumers outside the
browser bundle: ops scripts, Playwright and Tauri.

That location also contradicts the brief's own decision that `src/api/` holds
oRPC procedures only.

**Decision:** it goes at `src/api-client.ts` <!-- docs-check-ignore --> beside
the other cross-cutting modules (`src/analytics.ts`, `src/environment.ts`), so
`src/api/` stays procedures only and the rule in the `http-surface` test can say
so without an exception.

### 6. The docs check found correction 5, not a person

Worth recording because it is the argument for the check: this plan failed
`tests/repo/docs.test.ts` on first write, naming a path that does not exist.
That is exactly the drift the check was built for, on the first document written
after it was pointed at a new plan.

Two further details to preserve, not change:

- The `dev` base builder is parameterised by flag, not a single gate.
  `POLICY` grants `seedRoute` and `devSessionRoutes` on **staging** while
  `devMailRoutes` is dev-only, so `dev(flag)` takes which policy key it needs.
- `GET /api/dev/accounts` is gated on the sign-in code and `offersAdminSignIn`,
  not on a `dev*Routes` flag. Keep its own gate when it becomes a procedure.

## Part A — JSON endpoints become procedures

URLs do not change; each procedure keeps `.route({ method, path })`.

- [ ] `POST /api/seed` → `router.dev.seed`, `dev(seedRoute)`
- [ ] `POST /api/analytics` → `router.telemetry.report`, `pub`
- [ ] `GET /api/dev/events` → `router.dev.analyticsEvents`
- [ ] `GET|DELETE /api/dev/outbox` → `router.dev.outbox.list` / `.clear`
- [ ] `GET /api/dev/email/:name` → `router.dev.outbox.get`
- [ ] `DELETE /api/dev/otp` → `router.dev.otp.clear`
- [ ] `GET /api/dev/accounts` → `router.dev.accounts` (own gate, see above)
- [ ] `POST /api/dev/prune-sessions` → `router.dev.sessions.prune`
- [ ] `GET /api/versions` → `router.health.versions`, `pub`
- [ ] Delete `src/routes/seed.ts`, `src/routes/analytics.ts`,
      `src/routes/dev-mail.ts`, `src/routes/dev-sessions.ts`, and the inline
      `/api/versions`

## Part B — Remove Hono

- [ ] `logger()` → oRPC interceptor over the existing points in `src/api/telemetry.ts`
- [ ] `cors()` → `CORSPlugin` on the OpenAPI handler only
- [ ] `csrf()` → `SimpleCsrfProtectionHandlerPlugin` on the RPC handler, with the
      existing auth tests proving it rejects the same cross-origin POSTs first
- [ ] `/api/auth/*` → `auth.handler(request)` called directly
- [ ] `.well-known` files → written by `scripts/build.ts` into the client bundle
- [ ] `GET /api/unsubscribe` → SPA route; `POST` → form-encoded procedure at the
      same URL, RFC 8058 semantics unchanged
- [ ] Delete `src/routes/`, the Hono half of `src/api/unsubscribe.ts`, and `hono`

## Part C — One `index.ts`

- [ ] Fetch handler: auth → RPC → OpenAPI → assets → shell. Order is the
      documentation. `POLICY` gating lives in the `dev` builder, not here.

## Part D — One typed client

- [ ] `createApiClient(baseUrl, { headers? })` in `src/api-client.ts` <!-- docs-check-ignore -->
      over the OpenAPI link; the SPA's `src/web/lib/orpc.ts` stays on `RPCLink`
- [ ] Replace every raw `fetch` call site found by grep (see correction 4)
- [ ] `knip` reports zero unused exports

## Part E — `bun run ops`

- [ ] `ops smoke` derives its public-route list from the served spec, not a hand list

## Part F — One source for the API reference

- [ ] Extract handler options to `src/api/openapi.ts` <!-- docs-check-ignore -->
- [ ] Generator at `scripts/ops/openapi.ts` <!-- docs-check-ignore --> writes
      `sites/help/schema/openapi.json`; no server, no fetch
- [ ] `--audience public|internal`, filtered by tag; `dev` and `infrastructure`
      dropped from public
- [ ] `ops docs check` and `tests/repo/docs.test.ts` fail on drift
- [ ] `developer*.mdx` links move to `/api/openapi.json`; `info.version` reads
      `package.json`
- [ ] Note the future agent surface beside the tag list; do not build it

## Delivery order

- [x] **1. The `http-surface` test — it fails, and that failure is the list of
      work.** Done 2026-09-11. `src/surface.ts` holds the dispatch table as
      data; `tests/repo/http-surface.test.ts` asserts four rules against it.
      Two pass (every prefix carries a guard sentence; no prefix is shadowed by
      an earlier one) and two fail with the worklist: **11 Hono imports across 8
      files** and **12 stray route literals in `src/index.ts`**. Repo tier 36/37
      files green — only the new one red, by design. `tsc` clean.
- [ ] 2. Part A, one endpoint at a time, `smoke` green throughout.
- [ ] 3. Part B, then Part C; delete the packages last.
- [ ] 4. Part D, `knip` zero.
- [ ] 5. Part F, expecting a large schema diff — that is the drift being paid off.
- [ ] 6. Part E, `ops smoke --env staging`, `ops docs check`.

## Log

- 2026-09-11 — plan recorded; six corrections above found by reading the tree
  against the brief before starting. The fifth was found by
  `tests/repo/docs.test.ts` rejecting this file on first write.
- 2026-09-11 — step 1 green-as-designed. The surface table is data
  (`src/surface.ts`) rather than branches, at the Product Owner's refinement, so
  the replacement rule has a subject that cannot go empty — which is the exact
  way the rule it replaces would have died.
