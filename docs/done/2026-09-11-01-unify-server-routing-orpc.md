# Unify server routing: oRPC owns every endpoint, Hono is removed

Archive: completed (2026-09-11). Hono is gone; every endpoint is an oRPC procedure and `src/index.ts` is a fetch handler over a dispatch table. Deployed to staging and production, both verified on the real edge. Return to [current work](../README.md).

**Status:** complete. One PR, 2026-09-11.
**Principle:** every endpoint is an oRPC procedure. There is no server-side router
library. `src/index.ts` is a fetch handler that dispatches by prefix to Better
Auth, oRPC and assets, and nothing else.

Do this before the notifications spec and the router migration. The router
migration's A2 (shell for every path) is subsumed by Part C.

## Corrections to the brief, found by reading the tree first

Fourteen things the specification assumes are not quite what is there. Each changes
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

### 9. `dev.outbox.get` is the wrong name for the template preview

The brief maps `GET /api/dev/email/:name` to `dev.outbox.get`, read off the URL
shape. It reads no outbox and no database: it renders a named template with the
fixtures' names, and the code it shows is the literal 424242, never anyone's
issued one. Nothing it returns was ever sent.

**Decision:** `dev.mail.preview`, beside the templates it renders. `name` is a
Zod enum so an unknown one is a 400 naming the valid choices, not a 404 that
reads like a routing fault. The enum derives from `PREVIEWS` in
`src/mail/templates/index.ts` — a deliberately dumb `Record<name, render>`, so
the notifications unification collapsing game, meeting and reminder into one
generic template is a deletion from that record rather than a refactor.

The registry made an existing gap visible on arrival: `src/mail/templates/meeting.tsx`
is a real template with no preview, and nothing noticed.

Output is a `File`, which the OpenAPI handler serves as a raw body with its own
Content-Type. The Product Owner opens this in a browser to read the copy, and
JSON-wrapped HTML would be unreadable. A worker test asserts the content type
rather than the status, because a regression to JSON would still be a 200.

### 10. `csrf()` protected nothing, and `/rpc` was unprotected

The brief asks for parity: prove the existing auth tests still reject the same
cross-origin POSTs, then delete `csrf()`. Two things were not as assumed.

**No such test existed.** Every test in the suite sends `Origin: ORIGIN`, so a
suite-wide pass proved only that same-origin requests work. Deleting the
middleware would have gone unnoticed.

**The middleware stopped nothing.** Written against it, the auth assertion
stayed green with `csrf()` commented out — Better Auth compares the Origin
against its own `trustedOrigins` and refuses with `INVALID_ORIGIN`
(`src/auth.ts`). It was a second lock on a door Better Auth already holds.

**And `/rpc` was never behind it.** `app.use(csrf())` sat at line 128, after
the oRPC handlers, which return on a match — so a cross-site POST carrying the
reader's cookies reached a procedure. Measured, not reasoned:

| surface | same-origin | cross-origin, before |
|---|---|---|
| `/api/auth/*` | 200 | 403 (Better Auth, not `csrf()`) |
| `/rpc/*` | 200 | **200** |
| `/api/*` | — | 200 (correct — the CORS-open REST surface) |

So this step is not parity, it closes a hole. `SimpleCsrfProtectionHandlerPlugin`
on the RPC handler requires `x-csrf-token: orpc`, which a cross-site page cannot
set without a preflight `/rpc` does not grant — stronger than an Origin the
caller writes. **Its client pair is mandatory**: `SimpleCsrfProtectionLinkPlugin`
in `src/web/lib/orpc.ts`, because the server plugin alone breaks every SPA call.

The plugin is deliberately NOT on the OpenAPI handler: `/api` grants
`cors({ origin: "*" })` for external clients, and the same header requirement
would refuse all of them.

### 11. The unsubscribe page is not an SPA route

The brief moves `GET /api/unsubscribe` to an SPA route. The code it would have
replaced argues against that in its own comment, and the argument holds:

> Plain HTML with a form — no app, no session, no JavaScript — because somebody
> who has stopped using the app should not have to load it to stop the email.

Making it an SPA route would download the whole bundle so a person who has
already left can press one button. **Decision, confirmed by the Product Owner:
it stays a rendered page.** It leaves Hono the same way the mail preview did —
an oRPC procedure returning a `File`, so the handler serves raw HTML with its
own Content-Type and no SPA is involved.

The POST needed no coercion plugin. oRPC's OpenAPI handler parses
`application/x-www-form-urlencoded` natively; the input is declared
`inputStructure: "detailed"` because the token is a query parameter while the
body carries the RFC's marker, and the body is left loose so a client sending
`List-Unsubscribe=One-Click` and one sending nothing are both honoured.
Refusing either would read to Gmail as an unsubscribe that does not work, which
is a deliverability problem long before it is a 400.

### 12. The shell fallback in Part C's sketch was too wide

The sketch answers `asset.status === 404 && request.method === "GET"` with the
shell. That would serve an HTML page for
`/.well-known/apple-app-site-association` when the identifiers are unset — and
iOS caches the association file, so it would be cached as a page and universal
links would fail silently, months later, with nothing pointing at the cause.
The same reasoning covers a mail client following a link and the SPA's own
`fetch` for a chunk a deploy has renamed.

**Decision, from the Product Owner:** serve the shell only for a navigation —
a GET, whose `Accept` includes `text/html` (or `Sec-Fetch-Dest: document`),
whose path carries no file extension and is not under `/.well-known/`, `/api/`
or `/rpc/`. The `Accept` check is the one that matters: every caller that must
not get HTML asks for something else.

`/` is the one exception, added after `tests/worker/assets.test.ts` went red:
the root answered the shell unconditionally before this rule existed, has no
competing meaning, and a curl or a health probe with no `Accept` header should
get the app rather than a 404.

The owned prefixes are derived from `DISPATCH` rather than repeated, so a
prefix added to the table is excluded from the shell the same day.

### 13. Part F's target file, origin and endpoints were all something else

Three assumptions, none of which held, found by looking before writing:

- **`sites/help/schema/openapi.json` is not a copy of this API.** It is "Remy
  Sport Help Retrieval", describing the help site's own `/help-index.json` and
  `/llms-full.txt`, and `press.config.tsx` creates exactly those endpoints.
  Regenerating into it deleted both — 12,850 insertions against 5 deletions,
  measured and reverted.
- **`toolsOrigin` is not the app origin.** `deployment.generated.json` carries
  `toolsOrigin` at :8792, the separate `remy-help-local` Worker, and
  `appOrigin` at :8787.
- **`/application-openapi.json`, `/gemini-tools.json` and `/mcp` are not 404.**
  All three are served by `sites/help-tools/worker.mjs`, deployed from this
  repo by `ops docs-release`.

**Decision:** the app publishes the full document at `/api/openapi.json`, which
it already does. `sites/help-tools/` keeps its curated six read-only operations
at `/application-openapi.json` on its own origin, and nothing at the app origin
is ever named that. The generator writes no file at all — a `--write` pointed
at the help schema is how the next person makes the same mistake, so there is
no path to it in the code.

### 14. The `developer*.mdx` links are already correct — raised, not changed

The instruction was to point the three at the app's document. Reading them
first: the page is titled "Public help API and assistant tools" and opens with

> This API serves help content only. It has no access to accounts, live scores,
> team administration or broadcast controls. No API key is needed.

and the `/openapi.json` link sits in a three-item list beside `/help-index.json`
and `/llms-full.txt` — the help site's own retrieval endpoints, which is what
that schema describes. Repointing it at the app's full API would contradict the
paragraph above it and break the list it belongs to.

There is also no mechanism: the MDX content interpolates nothing, so
`${site.appOrigin}` cannot be written there. It would have to be a literal
origin per environment, in three locales.

**Decision:** the three links stay, and each page gains one new line naming the
app's API as separate — reference at `/api/doc`, schema at `/api/openapi.json`,
both absolute against the production origin. A literal origin is fine: the help
site is published for production, and one URL in three files is not a
maintenance burden. Both URLs are absolute rather than one of each, because a
relative `/api/openapi.json` on the help site is precisely the ambiguity that
produced corrections 13 and 14.

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
- [x] `POST /api/analytics` → `router.telemetry.report`, `pub`. Done
      2026-09-11. Input is deliberately permissive and checked in the handler:
      a beacon must be *dropped*, not answered 400, and a 400 would be recorded
      as `api.refused` by the interceptor — polluting the dataset it feeds.
- [x] `GET /api/dev/events` → `router.dev.analyticsEvents`. Done 2026-09-11,
      gated on `hasLocalEventStore` — the same capability that decides whether
      the ring is filled, so the endpoint cannot exist without data behind it.
- [x] `GET|DELETE /api/dev/outbox` → `router.dev.outbox.list` / `.clear`. Done 2026-09-11.
- [x] `GET /api/dev/email/{name}` → `router.dev.mail.preview`. Done 2026-09-11;
      renamed, see correction 9.
- [x] `DELETE /api/dev/otp` → `router.dev.otp.clear`. Done 2026-09-11, with
      `inputStructure: "detailed"` so `?to=` keeps working.
- [x] `GET /api/dev/accounts` → `router.dev.accounts`. Done 2026-09-11, keeping
      its own three-part gate rather than a `dev(capability)`.
- [x] `POST /api/dev/prune-sessions` → `router.dev.sessions.prune`. Done
      2026-09-11, with a new worker test asserting the five-per-user window
      rather than "some rows went".
- [x] `GET /api/versions` → `router.health.versions`, `pub`. Done 2026-09-11.
      `infrastructure` policy, Zod output preserving the `current` wrapper the
      three callers index into. Hono route deleted, `HONO_ROUTES` entry removed,
      ledger enrolled as `reviewed`. The dispatch worklist fell 12 → 11.
      Its worker test passes since correction 8 was resolved.
- [ ] Delete the raw routers. The seed and dev-session routers are gone
- [x] Delete the raw routers. Seed, dev-sessions, analytics and dev-mail are
      all gone (2026-09-11), along with the inline `/api/versions`. Part A is
      complete. The routes directory held only the Better Auth forwarder after
      this, and is gone too (Part C).

## Part B — Remove Hono

- [ ] `logger()` → oRPC interceptor over the existing points in `src/api/telemetry.ts`
- [ ] `cors()` → `CORSPlugin` on the OpenAPI handler only
- [x] `csrf()` → `SimpleCsrfProtectionHandlerPlugin` on the RPC handler. Done
      2026-09-11 in the order asked: write the missing test, prove it red
      without the guard, add the plugin, remove the middleware, suite green.
      The proving step is what found correction 10.
- [ ] `/api/auth/*` → `auth.handler(request)` called directly
- [x] `.well-known` files → emitted by `deepLinkAssociations` in
      `src/web/vite.config.ts`, per correction 7. Done 2026-09-11. Emitted only
      when the identifiers resolve, and never with a placeholder — iOS caches
      the association file, so a wrong team ID is worse than none. Identifiers
      come from the resolved config like every other value. Absence is visible
      rather than silent: `ops provision` lists both pairs as optional rows,
      and `ops smoke` reports "not configured" as a line, not a failure.
      **Found in the move:** the Apple path carries no extension by Apple's
      requirement, so the asset store served it with *no* `Content-Type` at all
      where the Worker route had set `application/json`. A `_headers` file is
      emitted beside it, and smoke asserts the type rather than only the
      status.
- [x] `GET /api/unsubscribe` stays a rendered page (correction 11); `POST` is a
      form-encoded procedure at the same URL, RFC 8058 semantics unchanged.
      Done 2026-09-11, gated by a worker test posting the exact body a mail
      client sends.
- [x] The Hono half of `src/api/unsubscribe.ts` is deleted (2026-09-11); the
      token helpers stay, since `src/api/transports.ts` signs every bulk mail
      with them.
- [x] The last router and the `hono` package are deleted (2026-09-11). The
      routes directory no longer exists; Better Auth's subtree is
      `src/auth-handler.ts`, a function rather than a router — it forwards the
      request untouched and adds the `auth.attempt` telemetry the brief's
      "Hono only forwarded to it" overlooked.

## Part C — One `index.ts` — **done 2026-09-11**

**The table declares order and ownership; the handlers decide matches.**
`index.ts` iterates `DISPATCH` in order, calls each owner's handler, and takes
the first that answers `matched: true`. It must **not** test
`pathname.startsWith(prefix)` itself and then assume that owner will answer:
`/api/auth/` and `/api` overlap, so a prefix test would hand every Better Auth
request to the OpenAPI handler, which would 404 it instead of falling through.
oRPC's `handle(request, { prefix })` already returns `{ matched: false }` for
anything its router does not own — that is the signal to try the next entry.
Recorded as a comment in `src/dispatch.ts`.

- [x] Fetch handler: auth → RPC → OpenAPI → assets → shell. Order is the
      documentation. `POLICY` gating lives in the `dev` builder, not here.
- [x] Keep the existing `queue` export verbatim — dead-letter handling and
      per-message ack/retry (correction 2)
- [x] Worker-tier test: Better Auth's subtree reaches Better Auth, not the
      OpenAPI handler — covered by `tests/worker/csrf.test.ts`, which only
      passes if the auth routes are answered by Better Auth's own origin check.
- [x] Worker-tier test: the shell is served for a navigation and for nothing
      else — `tests/worker/shell-fallback.test.ts`. See correction 12 for why
      the sketch's rule was too wide.

## Part D — One typed client

- [x] `createApiClient(baseUrl, { headers? })` in `src/api-client.ts`, over the
      OpenAPI link; the SPA's `src/web/lib/orpc.ts` stays on `RPCLink`. Done
      2026-09-11. **OpenAPI for everything outside `src/web/`**: that is the
      surface external clients use, CORS is open on it, and no CSRF header is
      involved — a question that means nothing for a CLI.
- [x] Replace every raw `fetch` call site the criterion says should move.
      **31 procedure calls at the start; `scripts/` is at 0 and `tests/` at
      19.** The other 18 of the original 49 are `/api/auth/*` — Better Auth's
      own routes, which have no oRPC client and are not a target.

      **Zero is not the target in `tests/`, and the criterion says why:**

      - *The raw request is the assertion* → it stays. A typed client would
        hide exactly what the test exists to see.
      - *The endpoint is setup or observation* → typed client.

      Three moved on the second rule: seeding a suite (`tests/e2e/seed.setup.ts`,
      two calls) and reading a code out of the dev outbox
      (`tests/helpers/auth.ts`). The nineteen that stay, and why:

      | Where | n | Why it stays |
      |---|---|---|
      | `tests/worker/write.test.ts` | 4 | The status *is* the assertion — 200 without a session, 404 for an unknown id rather than leaking which exist, 403 for an organizer who did not create the event |
      | `tests/worker/schedule.test.ts` | 4 | Same: 400 and 403 on authorisation boundaries |
      | `tests/e2e/domain-coverage.spec.ts` | 4 | `.ok()` on the HTTP surface, which is the coverage being measured |
      | `tests/worker/unsubscribe.test.ts` | 2 | A forged token must answer **400**; through a client that is an exception, not a status |
      | `tests/helpers/auth.ts` | 2 | Inside `page.evaluate` — they run in the browser on purpose, so the request carries the page's own session. A Node-side client cannot run there |
      | `tests/e2e/spa.spec.ts` | 1 | Also in-page |
      | `tests/e2e/admin-console.spec.ts` | 1 | `expect(users.ok())` is the precondition for the impersonation refusal that follows |
      | `tests/integration/cloudflare-video.mjs` | 1 | Plain `.mjs`, outside the typed build |

      **Zero was never the right number here.** The equivalent of the Hono
      count is `scripts/`, which is at zero.
- [ ] `knip` reports zero unused exports

## Part E — `bun run ops`

- [x] `ops smoke` derives its public-route list from the generated spec, not a
      hand list. Done 2026-09-11 — it calls `generate("public")`, the same call
      that produces the published document, so an endpoint added to the router
      is smoked the day it exists. It found a bug in its own first draft:
      `/standings` takes a required `eventId` and answered 400, which read as a
      broken endpoint and was a probe calling it wrongly. Parameterless GETs
      only now.
- [x] `ops provision` asserts the `BUILD` var resolves for each environment, with
      every field present. Done 2026-09-11. `/api/versions` answers "unknown"
      rather than 500 when the var is absent — right for the deploy poll, but it
      makes a forgotten var look like a real gap, so provision refuses instead.
      Verified on staging and production.

## Part F — One source for the API reference

- [x] Extract handler options to `src/api/openapi.ts`. Done 2026-09-11 as part
      of Part C — `specPath` and `docsPath` are route strings, and the dispatch
      rule forbids those in `index.ts`.
- [x] Generator at `scripts/ops/openapi.ts`, calling the spec generator
      directly — no server, no fetch. Done 2026-09-11. **It writes nothing.**
      See correction 13: the file the brief named belongs to the help site, and
      the app publishes its own document at `/api/openapi.json`, so there is no
      copy to keep.
- [x] `--internal` includes everything; the default drops the `infrastructure`
      policy, which is what `dev(capability)` and `infrastructure(why)` both
      mark. Done 2026-09-11. 57 public operations, 76 internal.
- [x] `ops openapi --check --env X` compares a deployment against this tree —
      the operation set, not the bytes, because the served document carries its
      own `servers` and is generated by the reference plugin. Done 2026-09-11;
      production answers with the same 98 operations. There is no committed
      snapshot for `docs.test.ts` to check, because there is no snapshot.
- [x] `info.version` reads `package.json` (`src/api/version.ts`), so a
      published reference says which release it describes instead of `0.1.0`
      forever. Done 2026-09-11.
- [x] The `developer*.mdx` links stay; each page gains one line naming the
      app's API as separate. Done 2026-09-11 in all three locales. See
      correction 14.
- [ ] Note the future agent surface beside the tag list; do not build it. It is
      noted in `src/api/openapi.ts` beside the `ApiKey` scheme.
- [ ] **F5's first task, recorded:** generate `sites/help-tools/`'s six
      read-only operations from this router instead of the hand-kept list in
      `application.mjs`, so there is one description of the API rather than two
      that agree by inspection. `worker-check.mjs` pins the count, the methods
      and the server URL, so its premise changes with it.

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

## Part A, as the authz walk sees it

Quoted rather than inferred. `bunx vitest run tests/repo/authz.test.ts
--silent=false --disable-console-intercept` — the second flag matters, because
`--silent=false` alone does not defeat vitest's console interception and the
summary stays invisible:

```
check-authz: 96 procedures, 52 enforced by the model, 44 declared otherwise;
             11 non-procedure routes accounted for

  infrastructure  dev.accounts          — the demo sign-in picker; offered only where a code
                                          can actually be read, and never offering the admin
                                          on a deployment
  infrastructure  dev.analyticsEvents   — dev only — 404s unless POLICY[env].hasLocalEventStore
  infrastructure  dev.mail.preview      — dev only — 404s unless POLICY[env].devMailRoutes
  infrastructure  dev.otp.clear         — dev only — 404s unless POLICY[env].devMailRoutes
  infrastructure  dev.outbox.clear      — dev only — 404s unless POLICY[env].devMailRoutes
  infrastructure  dev.outbox.list       — dev only — 404s unless POLICY[env].devMailRoutes
  infrastructure  dev.seed              — dev only — 404s unless POLICY[env].seedRoute
  infrastructure  dev.sessions.prune    — dev only — 404s unless POLICY[env].devSessionRoutes
  infrastructure  health.versions       — build metadata — the commit, branch and time this
                                          Worker was built from, plus its own URL; it names nobody
  infrastructure  telemetry.report      — a beacon, deliberately unauthenticated; writes only to
                                          Analytics Engine, reads nothing and names nobody
```

Each gate names the `POLICY` key it reads, so the capability a reader has to
check is in the line rather than in the handler. The non-procedure count is
down to 11 — everything left there is Part B.

## Returning HTML from a procedure

The reusable form, found twice — the mail preview and the unsubscribe page.

**`File` for the success body, a thrown `ORPCError` for anything non-2xx.** The
OpenAPI handler serves a `File` as a raw body with its own Content-Type, which
is what a page opened in a browser needs.

`outputStructure: "detailed"` looks like the better instrument and is not. It
JSON-wraps the body — an HTML page comes back as `"<!doctype html>…"` with the
quotes escaped — and it will not carry a non-2xx at all. Both were measured
while moving the unsubscribe pair, after a first version answered 200 to a
forged token and `tests/worker/push.test.ts` refused it: a refusal that answers
200 reads, to anything inspecting the response, like it worked.

`inputStructure: "detailed"` is unrelated and does work; it is how a procedure
reads a query parameter on a method whose input oRPC would otherwise take from
the body.

## The last thing it promised

F2 said the reference plugin would filter the served document by the same
policy. It did not, and the closing report said so without noticing what it
meant: production's `/api/openapi.json` published all seven dev operations —
seed, the outbox pair, the OTP clear, the template preview, the account picker,
prune-sessions — with their schemas, while answering 404 to every one. The 404s
were right. A document handing an internal surface to anyone who fetched it was
not.

Fixed 2026-09-11 with what was already built. `excludeInternal(env?)` in
`src/api/openapi.ts` is one predicate with two callers: a deployment passes its
own `env` and gets a document describing what it mounts, and the generator
passes none and gets the published set. The `dev` capability travels on the
policy mark itself rather than being parsed back out of its `why` string.

So production publishes 57 paths, staging publishes those plus the two it
mounts, and `--check` compares like with like — the "internal audience" caveat
in its output is gone, because the deployment no longer serves everything.

Covered both ways: `tests/unit/openapi-audience.test.ts` proves production
drops all seven and staging keeps exactly the two it grants, and
`tests/worker/openapi-audience.test.ts` proves the dev pool still *describes*
what it mounts — a filter that dropped them everywhere would pass a test that
only checked production.

## Closing

Hono is gone. `src/index.ts` iterates a dispatch table and owns no prefix of
its own; the routes directory no longer exists; the package is uninstalled.
Both environments run it and all three edge behaviours were checked against
Cloudflare rather than the pool.

<!-- That sentence first named the routes directory as a path, and the docs
check rejected it — for naming a directory this PR deleted. Which is the rule
the section below is about, arriving on the section that describes it. -->

What the PR actually cost, and what it bought, in the order it happened:

| Part | Outcome |
|---|---|
| A | 9 endpoints became procedures; 4 raw routers deleted |
| B | CSRF, CORS, logging and `.well-known` moved off Hono |
| C | The fetch handler; both dispatch rules went green in the commit that removed `hono` from `package.json` |
| D | `scripts/` at 0 raw procedure fetches; `tests/` at 19, each one named and justified |
| E | `ops smoke` derives its route list from the generated spec |
| F | `ops openapi` generates the document from the router — no server, no fetch |

**Fourteen corrections** to the brief, every one found by reading the tree
before writing to it. The costly ones were not the code: three separate
assumptions about `sites/` were wrong, and acting on the first cost a 12,850-line
overwrite of the help site's own retrieval schema, reverted.

**What the checks caught that review did not.** The pattern worth keeping is
that almost every real defect here was found by something mechanical, and
several were found by a check catching its own author:

- `tests/repo/docs.test.ts` rejected the plan on its first write, for naming a
  path that did not exist.
- The `remedies` rule caught a comment citing the file the same commit deleted.
- `push.test.ts` caught a refusal answering 200 where it had answered 400.
- The e2e gate caught a base URL of `""` that `tsc` could not see.
- The deploy's own `wait` caught a build stamp disagreeing by three minutes.
- The new smoke check caught a bug in its own first draft — `/standings` takes
  a required parameter and was being probed without one.
- And `ops committed` exists because I pushed a commit containing only a
  deletion, having tested a working tree that was correct while the commit was
  not.

**The shape that recurred.** Twice, a check had no subject and therefore
reported success: `authz.test.ts` would have iterated an empty route table once
Hono was deleted, and `csrf()` was mounted after the handlers that return on a
match. Both were replaced by things that cannot become empty — a `DISPATCH`
array, and a test that sends a foreign `Origin`. The question that found both
was *what is this check looking at*, not *is it passing*.

## Follow-ups, not this PR

- **F5's first task:** generate `sites/help-tools/`'s six read-only operations
  from this router instead of the hand-kept list in `application.mjs`, so there
  is one description of the API rather than two that agree by inspection.
  `worker-check.mjs` pins the count, the methods and the server URL, so its
  premise changes with it. **Absorbed into the ops api issue**, where the same
  executor serves both the CLI and help-tools' six operations.
- ~~**`tests/repo/manifest.test.ts` reads a build artefact it does not own.**~~
  **Fixed 2026-09-11.** It compared the built manifest against the *ambient*
  `CLOUDFLARE_ENV`, so the answer depended on what the machine last did rather
  than on what is in `dist/` — deploying staging left `bun run test` red until
  the next production build. It now reads the environment from the Worker
  config the same build wrote beside the client, so it compares two artefacts
  of one invocation: disagreeing is a real bug, agreeing is real agreement, and
  neither depends on this shell. Proven both ways — green after a staging build
  with no environment exported, and still red when a staging build carries the
  production name.

## Log

- 2026-09-11 — a module that did something on import. `scripts/deploy/smoke.ts`
  imports `generate` from `scripts/ops/openapi.ts`, and the CLI branch there
  had no guard — so every smoke run printed half a megabyte of JSON before its
  first check, and `ops smoke --env production` opened with a stray `{`.
  Guarded with `import.meta.main`. Noticed by reading smoke's own output rather
  than by a check, which is the kind of thing only reading catches.

- 2026-09-11 — **reconciling 98 against 57 and 76.** They are different units,
  not a bug. `--check` counts *operations* — a method on a path, so
  `/dev/outbox` is two — against the **internal** document, which is the right
  audience because the served `/api/openapi.json` applies no filter. The
  earlier figures counted *paths*. In full: internal 76 paths / 98 operations,
  public 57 paths / 77 operations. The check now prints both numbers, because
  one alone invites the question.
- 2026-09-11 — measuring that found a second defect. The document is half a
  megabyte and a pipe holds 64 KB: `ops openapi | jq` delivered exactly 65,536
  bytes and a parse error, while a redirect to a file delivered all 510,058.
  Neither `console.log` nor a synchronous write to fd 1 fixed it — the process
  was exiting with the rest unflushed. Awaiting the write callback does.

- 2026-09-11 — **a failed staging deploy, and the right lesson from it.** The
  e2e gate refused `tests/e2e/seed.setup.ts`: `apiFor(request)` defaulted its
  base URL to `""`, so the link built `new URL("/api")` and threw from inside
  its codec before any fetch happened. Not the `NOT_FOUND` seam — staging
  permits `seedRoute` — and not the fetch adapter, which was never reached.

  Four local checks were blind to it. `tsc` and `ops committed` cannot see it:
  `""` is a valid `string`. `tests/worker/api-client.test.ts` passed an
  absolute URL and exercised only the working path. And `bun run test` never
  imported the helper at all, because it reached `@playwright/test` through
  `./auth.ts` — which put it outside the fast tier entirely.

  **The tempting conclusion is that `check` should run e2e. That is the wrong
  lesson.** e2e is slow and belongs in the deploy gate, which ran it and caught
  this exactly as intended. The right lesson is to keep Playwright-only code to
  the thin adapter, so everything else is reachable from the fast tier —
  `tests/helpers/api.ts` no longer imports `@playwright/test`, and a unit test
  now covers the default that broke.

  That unit test found a second instance the moment it existed. `BASE_URL` was
  two names: this repo's "origin the suite is pointed at", and Vite's "public
  base path", which Vitest injects as `"/"`. The same broken value by a
  different route. Renamed to `E2E_ORIGIN` across `scripts/e2e.ts`,
  `playwright.config.ts` and `tests/helpers/auth.ts`; the absoluteness check
  stays because it is cheap.

- 2026-09-11 — **the contract is the router key.** The rename test renames the
  *key*, not the export. Renaming `export const versions` while `src/api/index.ts`
  still read `versions: health.versions` changed nothing the client can see, and
  `tsc` passed — which would have been reported as D working. Anyone re-running
  this proof will reach for the export first; it is the key that is the API.
- 2026-09-11 — **D's premise, demonstrated rather than asserted.** Renaming the
  router key `health.versions` to `buildInfo` fails `tsc` at two call sites in
  `scripts/ops/versions.ts`. The first attempt renamed the *export* and proved
  nothing: the router key still read `versions:`, so the client saw the same
  shape. The client sees router keys, and that is the thing a rename has to
  move.
- 2026-09-11 — the typed client found a loose contract on its first use.
  `dev.analyticsEvents` declared `event: z.string()` where the tracker's
  catalogue is a closed set, so `ops analytics` could not assign the result to
  its own `EventName`. Tightened to `z.enum` derived from `EVENTS` in
  `src/analytics.ts` — the same registry rule as the mail templates: one list,
  so an event added to the tracker is an event the procedure accepts.
- 2026-09-11 — one helper, both tiers. `tests/helpers/api.ts` takes the fetch
  as a parameter rather than hardcoding one: Playwright holds an
  `APIRequestContext` carrying the suite's session, the worker pool holds
  `SELF.fetch`, and neither is the global fetch. A helper that picked either
  would work for one tier and quietly sign the other out.
  `tests/worker/api-client.test.ts` guards that shape — build the client from
  the global fetch and the Playwright suites keep passing while this one stops,
  which is the right way round.
- 2026-09-11 — the one behavioural seam in Part D, flagged by the Product Owner
  before it bit: a dev-gated procedure answers `ORPCError` with code
  `NOT_FOUND`, not a 404 *status*. `smoke.ts` asserted `res.status === 404` to
  mean "absent here" and now catches the code — a rejection is the pass. Gated
  off and never built are indistinguishable from outside, which is the point.

- 2026-09-11 — `bun run ops committed` added after breaking `origin/main` for a
  few minutes. It typechecks `git archive HEAD`, not the working tree, which is
  the difference that mattered: every check was green against a tree that was
  correct while the commit was not. Proven against the offending commit itself
  — `ops committed ac36d53` reports the dangling
  `./routes/well-known` import. The next two steps each delete a file
  `index.ts` imports, so it runs before every push from here.

- 2026-09-11 — plan recorded; six corrections above found by reading the tree
  against the brief before starting. The fifth was found by
  `tests/repo/docs.test.ts` rejecting this file on first write.
- 2026-09-11 — **the recurring shape, twice in one PR.** The August review
  filed the CSRF ordering as "csrf after routes that need it", which reads as a
  guard applied too weakly. It was not weakened: mounted after the handlers
  that return on a match, it had no subject at all — `/rpc` was never behind
  it, and its only other target was a door Better Auth already holds. That is
  the same class as the finding this PR opened with, where deleting Hono would
  have left `tests/repo/authz.test.ts` iterating an empty route table and
  passing. **A check whose subject is empty reports success.** Both were found
  by asking what the check was looking at rather than whether it passed, and
  both are now asserted against something that cannot become empty — a
  `DISPATCH` array, and a test that sends a foreign Origin.
- 2026-09-11 — step 1 green-as-designed. The surface table is data
  (`src/dispatch.ts`) rather than branches, at the Product Owner's refinement, so
  the replacement rule has a subject that cannot go empty — which is the exact
  way the rule it replaces would have died.
