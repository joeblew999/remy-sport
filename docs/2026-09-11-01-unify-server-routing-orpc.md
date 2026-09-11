# Unify server routing: oRPC owns every endpoint, Hono is removed

**Status:** in progress, started 2026-09-11. One PR.
**Principle:** every endpoint is an oRPC procedure. There is no server-side router
library. `src/index.ts` is a fetch handler that dispatches by prefix to Better
Auth, oRPC and assets, and nothing else.

Do this before the notifications spec and the router migration. The router
migration's A2 (shell for every path) is subsumed by Part C.

## Corrections to the brief, found by reading the tree first

Eight things the specification assumes are not quite what is there. Each changes
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

**Decision:** the non-procedure list becomes the `DISPATCH` array in
`src/dispatch.ts`, and `tests/repo/dispatch.test.ts` asserts against that array
— not against a router's route table, and not against `index.ts` source. An
array cannot lose its subject the way `app.routes` does. After Part A the list
is short: Better Auth's subtree, the asset fallback, the shell. Everything else
has become a procedure and is covered by rule one. The second rule in
`tests/repo/authz.test.ts` is deleted only when this is green, never before.

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
`src/api/` stays procedures only and the rule in the `dispatch` test can say
so without an exception.

### 6. The docs check found correction 5, not a person

Worth recording because it is the argument for the check: this plan failed
`tests/repo/docs.test.ts` on first write, naming a path that does not exist.
That is exactly the drift the check was built for, on the first document written
after it was pointed at a new plan.

### 7. `.well-known` is emitted by Vite, not by `scripts/build.ts`

The Vite plugin owns `dist/client`, so anything written there from outside is at
risk of being clobbered on the next build. The two association files go in
`src/web/public/.well-known/` <!-- docs-check-ignore --> and are copied verbatim
if the values are static, or emitted by a small Vite plugin if they need the app
ID from the environment.

`buildConfig` must keep the `[assets]` block's `html_handling = "none"` and
`not_found_handling = "none"` in the generated config, since the generated one
is what deploys. Worth a one-line check that both keys survive.

### 8. `__BUILD__` is undefined in the worker test tier — a live defect

Found by writing the worker test for `/api/versions`. `GET /api/versions`
answers **500** there; with the `__BUILD__` reads replaced by literals it
answers 200, so the build stamp is the cause.

Production is unaffected: `src/web/vite.config.ts` uses `@cloudflare/vite-plugin`
and its `define` covers the Worker, and `wrangler deploy` ships the built
`dist/`. The gap is the test pool, which builds `src/index.ts` from
`wrangler.toml` and never performs that substitution.

**The finding is not "the harness is wrong" — it is that Worker code depends on
a compile-time define at all.** `__BUILD__` is a constant smuggled past the
environment model this repo already has: it is the one value that differs
between dev, staging and production without `POLICY` or provisioning knowing.
The Worker inherited that dependency from the Hono route; the move to a
procedure did not create it, it revealed it, because a procedure gets a test
and a raw `c.json(...)` never did.

So it is named here rather than worked around. Attempted and rejected, recorded
so nobody retries them: Miniflare `globals` (not honoured); a `pre`-enforce Vite
plugin doing the substitution (it *runs* — it logs a transform of
`src/api/health.ts` — yet the Worker still 500s, so the worker graph is not the
graph that transform feeds); project-level `define` (reaches test files only);
`[define]` in `wrangler.toml` (would bake a fixed stamp into the deploy config).
Every one of those extends the problem.

The resolution that fits the repo's own model is that a Worker value comes from
`[vars]` in `wrangler.toml`, read from `env`, which the pool honours because it
reads that file directly. Making the build stamp a var touches `buildConfig` and
the deploy path, so it is its own change and not smuggled into Part A.
`src/api/health.ts` is the only Worker reader of `__BUILD__` — the SPA's three
readers are client-side and unaffected — so the blast radius is one procedure.

**Resolved 2026-09-11, in its own commit before the remaining eight endpoints.**
`stamp()` moved to `scripts/lib/build-stamp.ts` as the single definition, with
two readers: the SPA keeps its `__BUILD__` define (client-side, where a
compile-time constant is the honest shape), and the Worker reads `env.BUILD`.
`wrangler.toml` carries a placeholder `BUILD` var so `wrangler dev` and the
worker tier have a value; `buildConfig` overwrites it with the real stamp in
the generated config at deploy time, taking `environment` from that config's
own `vars.ENVIRONMENT` so the two cannot disagree.

`tests/repo/envs.test.ts` gains the rule: no module under `src/` outside
`src/web/` may read `__BUILD__`. It lives there rather than with the dispatch
rules because this is the environment model, not routing.

Proven end to end: the client bundle still carries the injected `BUILD_ID`; the
generated config carries the placeholder before `buildConfig` and the real
commit, branch and `builtAt` after it; `tests/worker/versions.test.ts` passes
against the placeholder shape. `stamp()` moved out of the Vite config rather
than being exported from it — the deploy script cannot import that file without
pulling the whole plugin graph, and `src/web/vite.config.ts` already imports
from `scripts/lib/`.

Two further details to preserve, not change:

- The `dev` base builder is parameterised by flag, not a single gate.
  `POLICY` grants `seedRoute` and `devSessionRoutes` on **staging** while
  `devMailRoutes` is dev-only, so `dev(flag)` takes which policy key it needs.
- `GET /api/dev/accounts` is gated on the sign-in code and `offersAdminSignIn`,
  not on a `dev*Routes` flag. Keep its own gate when it becomes a procedure.

## Part A — JSON endpoints become procedures

URLs do not change; each procedure keeps `.route({ method, path })`.

**Each one enrols in `tests/repo/lib/domain-evidence.json` as `reviewed`, never
`unreviewed`.** The unreviewed list is the queue for behaviour nobody has looked
at; these are existing endpoints changing owner and have been looked at twice.
`intent` is `internal` for every `dev.*` and for `health.versions` (matching the
38 existing internal entries) and `derived` for `telemetry.report`; `reason`
names the Hono route it moved from and this date; `audience` carries the
`POLICY` key that gates it. The procedure **and** each of its output fields get
a row.

Two limits of the ledger schema, found by writing the first one:

- `cases` accepts only `render`, `worker` and `persistence` levels, mapped to
  `tests/render/`, `tests/worker/` and `tests/e2e/`. A repo-tier test such as
  `tests/repo/envs.test.ts` **cannot** be cited as a case, so policy-gating
  evidence lives in `reason` and `audience` rather than in `cases`.
- `audience` must be non-empty, so a `pub` procedure cannot record "none".
  `health.versions` uses `["operations"]`, matching the existing
  `procedure.health.get`.

`audience` is currently only checked for non-emptiness — writing the `POLICY`
key there *records* each gate but nothing yet *asserts* the string names a real
key. A rule that validates it against `POLICY` would close that, and is worth
adding when `dev.accounts` lands.

- [x] `POST /api/seed` → `router.dev.seed`, `dev(seedRoute)`. Done 2026-09-11;
      covered by the two existing seed tests in `tests/worker/write.test.ts`.
- [ ] `POST /api/analytics` → `router.telemetry.report`, `pub`
- [ ] `GET /api/dev/events` → `router.dev.analyticsEvents`
- [ ] `GET|DELETE /api/dev/outbox` → `router.dev.outbox.list` / `.clear`
- [ ] `GET /api/dev/email/:name` → `router.dev.outbox.get`
- [ ] `DELETE /api/dev/otp` → `router.dev.otp.clear`
- [ ] `GET /api/dev/accounts` → `router.dev.accounts` (own gate, see above)
- [x] `POST /api/dev/prune-sessions` → `router.dev.sessions.prune`. Done
      2026-09-11, with a new worker test asserting the five-per-user window
      rather than "some rows went".
- [x] `GET /api/versions` → `router.health.versions`, `pub`. Done 2026-09-11.
      `infrastructure` policy, Zod output preserving the `current` wrapper the
      three callers index into. Hono route deleted, `HONO_ROUTES` entry removed,
      ledger enrolled as `reviewed`. The dispatch worklist fell 12 → 11.
      Its worker test passes since correction 8 was resolved.
- [ ] Delete the raw routers. The seed and dev-session routers are gone
      (2026-09-11) along with the inline `/api/versions`; `src/routes/analytics.ts`
      and `src/routes/dev-mail.ts` remain.

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

**The table declares order and ownership; the handlers decide matches.**
`index.ts` iterates `DISPATCH` in order, calls each owner's handler, and takes
the first that answers `matched: true`. It must **not** test
`pathname.startsWith(prefix)` itself and then assume that owner will answer:
`/api/auth/` and `/api` overlap, so a prefix test would hand every Better Auth
request to the OpenAPI handler, which would 404 it instead of falling through.
oRPC's `handle(request, { prefix })` already returns `{ matched: false }` for
anything its router does not own — that is the signal to try the next entry.
Recorded as a comment in `src/dispatch.ts`.

- [ ] Fetch handler: auth → RPC → OpenAPI → assets → shell. Order is the
      documentation. `POLICY` gating lives in the `dev` builder, not here.
- [ ] Keep the existing `queue` export verbatim — dead-letter handling and
      per-message ack/retry (correction 2)
- [ ] Worker-tier test: `GET /api/auth/session` reaches Better Auth, not the
      OpenAPI handler
- [ ] Worker-tier test: an undeclared path under `/api/` gets oRPC's own 404,
      never a raw `Response`

## Part D — One typed client

- [ ] `createApiClient(baseUrl, { headers? })` in `src/api-client.ts` <!-- docs-check-ignore -->
      over the OpenAPI link; the SPA's `src/web/lib/orpc.ts` stays on `RPCLink`
- [ ] Replace every raw `fetch` call site found by grep (see correction 4)
- [ ] `knip` reports zero unused exports

## Part E — `bun run ops`

- [ ] `ops smoke` derives its public-route list from the served spec, not a hand list
- [x] `ops provision` asserts the `BUILD` var resolves for each environment, with
      every field present. Done 2026-09-11. `/api/versions` answers "unknown"
      rather than 500 when the var is absent — right for the deploy poll, but it
      makes a forgotten var look like a real gap, so provision refuses instead.
      Verified on staging and production.

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

- [x] **1. The `dispatch` test — it fails, and that failure is the list of
      work.** Done 2026-09-11. `src/dispatch.ts` holds the dispatch table as
      data; `tests/repo/dispatch.test.ts` asserts four rules against it.
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
  (`src/dispatch.ts`) rather than branches, at the Product Owner's refinement, so
  the replacement rule has a subject that cannot go empty — which is the exact
  way the rule it replaces would have died.
