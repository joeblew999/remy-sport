# Public help: isolated Fumapress proof

Archive: completed (2026-09-10). Isolated dev, staging and production help/MCP implemented; both remote help Workers deployed and externally verified 2026-09-09. **Acceptance pending:** real Gemini execution and Google indexing need Google credentials nobody here has.

Current work: [project index](../README.md). Original evidence follows.
Status: **blocked on external access, not on work.** Isolated dev, staging and
production help/MCP are implemented, and both remote help Workers were deployed
and externally verified on 2026-09-09. Real Gemini
execution and Google indexing remain unverified pending Google credentials/access.
The original local proof was implemented on 2026-09-09. This replaces the earlier proposal
to merge generated help into the app's Worker. The user's priority is protecting
the repository and application from documentation dependencies.

## Boundary

The independent package is [sites/help](../sites/help/package.json). It is not a
Bun workspace and has its own committed lockfile, node_modules, Vite configuration
and build output. There are no Fuma packages in the root manifest or lockfile,
no imports from the app into help, and no changes to the app's Vite or Wrangler
configuration. MCP and Studio run in independent sibling packages, each with its own lockfile.
Neither is imported into the public help build.

Fumapress 1.2.0 builds 39 pages across English, Thai and Japanese in static mode. Its Cloudflare config
has its own name, no application bindings or routes, and a reserved .invalid
canonical hostname. It cannot be mistaken for a configured production help site.
No content is copied into the app's asset directory. A future deployment would
use a separate Worker and hostname, under the team's automation.

This is dependency/build isolation, not an OS security sandbox. Dependency
installers and build code still execute with the user's filesystem permissions.
Do not describe a same-repository package as protection against malicious code.

## One command

From the repository root:

```sh
bun run ops docs check
```

This command validates the existing Bun pin, installs the isolated help, MCP and editor packages with
their frozen lockfiles, checks local dependency resolution, removes stale help
output, builds, packages with Wrangler dry-run, starts local Cloudflare
emulation on a free loopback port, checks responses, and stops that process group.

It bypasses the app installer deliberately. App files, dependency manifests and
symlink targets are fingerprinted before and after, including existing uncommitted
app source. A change fails the command and names affected paths; it never resets
someone else's work. The docs Vite build also refuses module loads outside its
package. No inherited app credentials or deployment overrides are passed to
children. This measures the covered files; it is not a whole-filesystem audit.

`bun run ops docs preview` runs the same checks and keeps the verified preview
open until Ctrl-C. `bun run ops docs clean` removes only the three help packages’ dependencies and
generated output. Neither command deploys anything. Setup and cleanup need no
manually coordinated servers.

The generated result is in `sites/help/.proof/result.json`; it is not committed. <!-- docs-check-ignore -->
The module-path audit is beside it. The public content is deliberately outside
the internal `docs/` tree. Generated files and installed dependencies are ignored.

## Initial proof evidence (before expansion)

- Independent install succeeded: 357 packages reported on the first installation.
  The size of the docs dependency tree is real; none was installed into the app.
- Static Fumapress build succeeded; Wrangler dry-run read 74 public assets.
- Local workerd checks passed for HTML, page Markdown, LLM index, sitemap, search
  index, noindex headers and an actual 404.
- The first complete docs run reported 2,461 app/dependency fingerprints unchanged.
- App TypeScript and lint passed after correcting the new CLI's environment type.
- The app's existing build passed with the isolated package present. It retains
  existing chunk-size/outDir/deprecated-option warnings.
- Repository/unit run: 394 passed, two failed. The failures point at the existing
  email changes: GET /api/dev/email/:name lacks a route-inventory entry, and four
  notification email fields lack domain-coverage classifications. Those app
  files were unchanged by the docs proof. They are the next fixes for the email
  work; this proof does not silently edit them.
- Isolation tests detect changed/deleted application files and dependency
  manifests, and enforce separation of the root package and deployment.
- Cleanup and clean locked-reinstall verification passed; both reported the
  same 2,461 fingerprints unchanged. Clean reinstall installed 357 packages
  in 2.86 seconds from the local package cache, then repeated the full proof.

The guard detects concurrent app edits too; if one occurs, investigate rather
than assuming the docs builder caused it or overwriting the newer file.

## Live authoring and verified features

Run `bun run ops docs dev` from the repository root. It installs the help lockfile
and runs Fumapress’s Vite development server at http://127.0.0.1:8791/ until Ctrl-C.
MDX and CSS edits update the open browser; configuration edits restart the server.
The app can continue using its own port and unchanged Vite configuration.
Use [the help README](../sites/help/README.md) for commands and local endpoints.
The CLI stops its previous dev server before running check, preview or clean.
Use `bun run ops docs stop` to recover a dev server whose terminal was closed.
Recovery matches the exact package CLI command, never just the port.

The following are implemented with the existing Fuma installation:

- Guides cover overview, sign-in, games, notifications, phone installation,
  role-based starting points, troubleshooting, news and developer/assistant access. Content describes verified app behavior and
  avoids promising unfinished email subscription functionality.
- Ordered sidebar, responsive navigation, table of contents and anchor links.
- Static full-text search. In Chrome, searching “email” returned sign-in content;
  selecting the sign-in result navigated to that guide.
- Copy Markdown and assistant-open controls supplied by Fumapress; explicit
  Markdown URLs, a product-named LLM index and complete LLM text export.
- Canonical links, descriptions, Open Graph metadata and generated 1200×630
  social images for every page, plus favicon and WebPage JSON-LD.
- Sitemap, robots file, build-time internal link validation, Markdown MIME types,
  search JSON MIME type and local noindex headers.

The shared check command audits every generated guide over local workerd HTTP:
HTML headings, visible descriptions, metadata, structured data, social-image
signatures, sitemap coverage, Markdown content/provenance, LLM index coverage,
full-text export consistency, response types and missing/private-route 404s.
It writes `sites/help/.proof/seo-llm.json`. <!-- docs-check-ignore -->
The initial six-guide proof produced a 1,100-byte index and 9,005-byte text export;
the expansion below supersedes those counts.
The browser was checked at 390px width with no horizontal overflow; the mobile
sidebar opened and navigated to the selected guide. The shared stop command and
subsequent dev restart passed with 2,461 app/dependency fingerprints unchanged. A temporary
content marker was removed and disappeared through HMR without navigation or a
manual reload. The marker is not part of the committed content.

### Known limits and tracked upstream issues

Reproduction steps, local fixes and upstream submission/removal status are kept
in the [upstream bug register](2026-09-09-05-fumapress-source-review.md#upstream-bug-and-workaround-register).

- This remains a local noindex site with a reserved canonical hostname. The
  audit proves document output, not Google indexing or Gemini recommendations.
  A public domain, crawlable deployment and subsequent search-console evidence
  are needed before making discovery claims.
- Fumapress 1.2.0 mutates the Markdown route’s slug array, which Waku reuses.
  A local plugin clones API route parameters before calling handlers. Repeated
  home Markdown requests are checked at dev startup; internal link validation
  now has no exemptions. Remove the workaround after an upstream fix is verified.
- Development probes `/api/search` as a module before routing it. The Vite guard
  allows that exact URL; other absolute paths remain checked against the package.
- Production HTML emits a CSS preload with an invalid `as` value, causing one
  browser warning. The actual stylesheet loads. This is upstream generated HTML;
  track an upstream fix/version before removing the warning from this record.
- Browser checks are a focused smoke test, not a complete accessibility audit.

## Execution plan — full local help system

Authorized 2026-09-09: implement the feature set autonomously, with the editor
**last**. This plan supersedes the earlier priority table. Keep this file as the
single plan; detailed upstream defects stay in the linked bug register.

Scope is an integrated local system, with reproducible commands and isolated
packages. No deployment, messages to third parties, production credentials or
changes to the app’s runtime/dependency graph. App source is read-only evidence
for guide accuracy. Human translation review and public indexing are external
validation steps, never silently claimed complete.

| Order | Deliverable | Acceptance | Status |
| --- | --- | --- | --- |
| 1 | Rich tutorials and role-based starting points | Fuma steps/tabs/callouts; spectator/player/organiser paths; interactive notification troubleshooting with text equivalent; responsive browser check | Implemented; checks passed |
| 2 | English, Thai and Japanese help | Native locale navigation/search; matching guide routes; hreflang/canonical/Markdown audits; translations explicitly marked pending human review | Implemented; local checks passed |
| 3 | News, release notes and RSS | A factual dated local-help release, blog/tag pages, working RSS discovery and feed checks | Implemented; local checks passed |
| 4 | Public developer reference | Fuma OpenAPI pages and request playground for the help system’s public read-only endpoints; downloadable schema; no private app API imports | Implemented; local checks passed |
| 5 | Assistant access | Read-only MCP with guide search/read tools and resources; protocol tests; one CLI startup; no model key required | Implemented; local checks passed |
| 6 | End-to-end verification | Shared check covers generated HTML, links, multilingual search data, feeds, API docs, Markdown and MCP; browser interactions; isolation fingerprints; README updated | Implemented; local checks passed |
| 7 — last | Visual editor, local CMS and collaboration | Separate authoring package; one command starts editor + help; constrained content root; saved edits survive restart, external edits/conflicts checked, collaboration tested and upstream limits recorded; saving never deploys | Implemented; local checks and browser save/live preview passed |

Implementation choices: retain Flexsearch unless a measured need justifies a
hosted provider; use Fuma’s maintained components/plugins before custom code;
keep interactive tutorials usable as plain text in Markdown. The public API
reference documents **help retrieval**, not an invented public Remy application
API. News must distinguish a local help release from an app release. Translations
can be usable local drafts while awaiting human language review. MCP and editor
services bind to loopback and remain outside the static/public app build.

For each stage, record commands, results, limitations and relevant commits here.
A broken required check keeps that stage open. Every framework workaround gets
an upstream record. Finish with the GUI running and a reproducible README.

References: [Fumapress/editor source review](2026-09-09-05-fumapress-source-review.md)
and [oRPC/Blume measurements](2026-09-09-03-orpc-blume-review.md).

### Expansion evidence before editor work

Shared docs check passed for 39 pages (33 authored pages and six generated API
reference pages), three locales, RSS, metadata, social images and Markdown. MCP
SDK client tests passed handshake, tools/resources, three-language search/read,
invalid paths and origin rejection. 2,461 app/dependency fingerprints unchanged.
Browser checks passed the troubleshooting selection, Android tab, Japanese
search and a real API-playground GET returning all 39 catalogue records.
Thai/Japanese social-image glyphs now use licensed local subsets. Typecheck,
lint and four focused repository tests passed. The static help artifact is about
18 MB, including optional syntax-language chunks from upstream OpenAPI; this is
not the amount fetched for a normal guide and none is added to the app bundle.

### Completed expansion — 2026-09-09

All seven local stages are implemented. Final `bun run ops docs check` passed:
39 pages; 8,948-byte all-language LLM index; 77,356-byte full-text export; all
metadata, hreflang, social images, search, feeds, schema, Markdown and 404 checks.
MCP passed protocol handshake, resource retrieval, read-only tools and language
search. Editor passed 33 unchanged real-document round trips, save conflicts,
external-file watching, two-peer collaboration, saved restart and path/origin
boundaries. All 2,461 monitored app/dependency fingerprints remained unchanged.

Browser evidence includes Studio autosave/reload, live help updating without
navigation, and external source restoration appearing in both views. The test
marker was removed. The official editor CLI is used, and its unused direct
WebSocket dependency was removed; normal installs use independent frozen locks.
`bun run typecheck`, `bun run lint`, and the two focused docs/isolation test files
(four tests) passed. Known earlier email test failures remain owned by the email
work, as recorded above; no app files were changed to hide them.

Start everything with `bun run ops docs author`: help at http://127.0.0.1:8791/,
read-only MCP at http://127.0.0.1:8792/mcp, Studio at http://127.0.0.1:8793/.
The README provides the same one-command workflow. Remaining external validation
is human translation review and, after a separately configured public launch,
actual Google indexing/Gemini discovery. This local noindex system cannot supply
that evidence. Editor offline collaboration and upstream CSS preload limitations
are recorded in the bug register; no upstream messages have been submitted.

## Current priority — external discovery and real API use

User steering: content and other features are deferred. The acceptance target is
Google/LLM access to the system and actual application API calls. The completed
local help milestone above does NOT satisfy that external acceptance target.

1. Verify the existing generated application OpenAPI contract and public GET
   calls through shared automation, without app imports or app changes.
2. Connect those verified reads to the isolated MCP service and emit Gemini
   function declarations; test protocol use and rejection of protected paths.
3. Verify public HTTPS reachability and crawl eligibility of the actual help
   hostname. The help hostname is still undecided; no deployment authorized or
   performed by this work. Do not treat the existing app hostname as an already
   deployed Fuma site.
4. With public endpoints and an explicitly configured Gemini test credential,
   prove model retrieval/tool use and record citations/tool results. Indexing
   requires Search Console evidence and may take time; never infer it from HTTP
   success, llms.txt, an OpenAPI file or a local mock.

`bun run ops docs discover` verifies the running local app by default; optional
arguments are application origin and public help origin. It reads the generated
schema and exercises the six explicitly allowlisted event/team/game list/detail
GETs. It emits a local report and Gemini function declarations under the isolated
tools package’s ignored .proof directory. No account credentials are forwarded.
MCP exposes the same reads in local author/dev mode. This is a public-data initial
connection, not permission for autonomous account changes or writes.

Google’s documentation distinguishes indexable web content from model tool use:
[Search AI eligibility](https://developers.google.com/search/docs/appearance/ai-features),
[Gemini URL context](https://ai.google.dev/gemini-api/docs/url-context),
[Gemini function calling and remote MCP](https://ai.google.dev/gemini-api/docs/function-calling).
An indexed API description does not automatically install a tool in the consumer
Gemini app. An explicit client tool connection is required for guaranteed API
execution. Public launch and a real Gemini call remain open until measured.

### External-access findings, 2026-09-09

Local discovery verification passed all six real public application reads at
127.0.0.1:8787 with 2,460 app/dependency fingerprints unchanged (the concurrent
app work had already changed the previous baseline before this run). The current
public origin returned HTTP 404 for its generated API schema. Consequently,
external API-use acceptance is **not complete**. This needs public route/deploy
repair before model testing. The isolated bridge tests passed MCP invocation,
authentication-contract changes failing closed, traversal/unknown-operation
rejection and absence of forwarded credentials. No production API was changed.

The existing `bun run ops versions` read-only report identified production
f936324 (2026-09-03), 189 commits behind the checkout at inspection time;
staging e9ce101 was 30 behind. This supports deployment drift as a likely cause
of the missing public schema, but does not prove the exact routing cause.
Publishing the current application would include unrelated changes and is not
silently bundled into the isolated help work. Next required work is a reviewed
public release/route repair plus a public help origin, followed by external
retrieval and a credentialed Gemini tool-call acceptance test.

## Proposed Cloudflare integration — dev, staging, production

Requested 2026-09-09. **Proposal only; not implemented or deployed.** Content
expansion is deferred. The objective is externally discoverable production docs
and verified assistant access to the corresponding application API.

### Deployment boundary

Retain the existing application Worker and all its bindings/configuration. Add
one independent help Worker per remote environment. Each help Worker serves the
static Fumapress assets and a small Fetch-based Streamable HTTP MCP handler.
The Node HTTP listener currently in help-tools is a local proof, not a deployable
Cloudflare handler; extract transport-independent tool logic and verify the new
Worker transport under workerd before making a compatibility claim.

Retain the three isolated packages and their lockfiles. Fumapress produces
static assets in help; help-tools builds the Worker entry and assembles those
assets into a separately owned deploy artifact. No root workspace or app imports.
The editor stays local and is excluded from every remote artifact. The help
Worker has no D1, R2, mail, queue, app secret or account-session bindings.
Cloudflare credentials belong only to the existing shared deployment automation.

| Environment | Help/MCP | App target | Index policy |
| --- | --- | --- | --- |
| dev | Loopback help at 8791; Vite live updates and local Worker protocol testing | Existing local app at 8787 | noindex |
| staging | Separate staging help Worker/custom hostname | App staging origin resolved from its existing Wrangler configuration | noindex on HTML and HTTP responses |
| production | Separate production help Worker/custom hostname | App production origin resolved from its existing Wrangler configuration | Crawlable, self-canonical production pages |

Suggested hostnames: help.remy.ubuntusoftware.net and
staging-help.remy.ubuntusoftware.net. These are proposals, not registered routes.
Do not mount the help build inside the app asset directory or replace app routes.
A same-path /help integration would add routing coupling and is not the initial
recommendation. Use a simple app Help link in a separately reviewed app change.

### One environment selection, validated end to end

Extend the shared ops/docs automation to use the existing environment names,
remote-target resolution, credential handling and resolved-config validation.
The orchestration layer may read app configuration; the help runtime must not
import app code. Keep help hostnames in help's own deployment configuration.
Derive and pass non-secret resolved settings explicitly during the build:
environment, help origin, app origin, build ID, commit and API contract digest.
Do not scatter URLs in content, browser code, MCP code and shell variables.

Every remote mutation requires --env staging or --env production; missing,
unknown or mixed targets fail before publishing. Declare environment vars and
bindings explicitly, accounting for Wrangler's non-inheritable bindings. Verify
the generated Worker name, custom hostname, app target and index policy together.
Independent output directories prevent a staging build being reused as a
production artifact. Never repair a mismatch by falling back to production.

Production and staging get separately built canonical URLs, sitemap URLs,
robots policy and machine-readable endpoint URLs. Staging noindex is not access
control: staging must continue to contain fixtures only. Do not block Googlebot
from fetching pages whose noindex needs to be observed. Private branch previews,
if added later, need access control and are not Gemini URL-context test targets.
Only production is submitted for indexing; workers.dev/preview aliases should
not introduce duplicate indexable copies.

### API and assistant connection

Keep the real application API and its generated OpenAPI document on the app
Worker. The help Worker exposes /mcp, documentation retrieval and a bounded
read-only API proxy for the selected event/team/game operations. This gives the
browser playground a same-origin endpoint without relaxing app CORS or sharing
cookies. Use explicit paths and methods, never an arbitrary URL proxy.

The proxy and MCP executor call only the configured same-environment public app
origin with no forwarded Cookie, Authorization or x-api-key headers. No service
binding granting broader app capabilities is required for this initial scope.
Both paths use the same allowlist and contract checks. Authentication-required
or unsupported operations fail closed. Protect the public endpoint with bounded
request/response sizes, timeouts and rate limiting; avoid an unbounded schema
fetch for every request by caching validation for a bounded interval and
invalidating it when the observed API build/contract changes.

Expose a generated OpenAPI contract for the supported proxy operations and
Gemini function declarations, with correct environment URLs. Link these and the
MCP endpoint visibly from the existing developer/assistant pages and discovery
index; a custom manifest is not treated as automatic Gemini tool registration.
Protected user actions and writes require a later explicit authentication and
permission design. No model credentials are needed in the public help Worker.

### Shared workflow (proposed commands, not yet available)

- `bun run ops docs dev`: keep Vite live updates; attach to the existing local
  app, or start its documented dev command when absent. Supervise only owned
  children. Start local tools/Worker testing automatically; no manual port or
  multi-terminal coordination. Studio remains the optional author action.
- `bun run ops docs check --env staging|production`: frozen installs, isolation
  checks, build target-specific artifact, workerd tests, deployed API identity
  and contract checks, Cloudflare dry run. A check does not publish anything.
- `bun run ops docs deploy --env staging|production`: the same gate, then publish
  only that help Worker, wait for its exact build ID and run external smoke and
  MCP tests. Do not run app migrations, seed commands or application publish.
- `bun run ops docs status --env staging|production`: compare served help build,
  served app build, expected origin and API contract compatibility.
- `bun run ops docs rollback --env staging|production`: restore the recorded
  previous help Worker version/assets and repeat compatibility checks. No app
  or database rollback. Block a rollback incompatible with the current app API.

These actions must use shared Cloudflare helpers, extended with explicit
component config paths where necessary; not a parallel credential/deploy stack.
Preserve the existing app deployment workflow. Later, its post-deploy verification
can check help/API compatibility as a read-only phase, without coupling app
availability to the docs build. A docs-only release never deploys the app.

### Release and failure handling

Gate against the **deployed target API**, not the developer's current checkout.
Record help build ID, source revision, tested app build ID and contract digest.
Identical app/help commits are not required: supported operations must remain
compatible. Production's presently missing API schema is a release blocker,
requiring a separately reviewed app release/route repair. Publishing all 189
unrelated commits is not an implicit part of publishing help.

Stage first. Prove the environment boundary with tests that deliberately wire
staging help to production and require rejection. Rebuild the same approved
help revision for production with production settings, recheck its live API,
and publish only after the gate passes. App/help deployment is not atomic;
compatibility checks and independent rollback are required, not an assumption
that two publishes succeed together. Post-publish failure must surface a failed
release, preserve reports and identify the previous version for recovery.

### Acceptance sequence

1. Workerd serves static docs plus the actual MCP transport; Vite still hot
   reloads locally. No editor/server-only assets leak into the public artifact.
2. Staging release proves correct API target, public GET execution, noindex,
   real 404s, rejected writes/credential forwarding, unchanged app artifacts and
   independent help rollback. No production data is used in staging tests.
3. Production passes anonymous external HTTP retrieval of pages, Markdown,
   sitemap, schemas and MCP protocol calls; verify robots, snippets/canonicals
   and absence of CDN login/challenge blocks on those intended public routes.
4. A real configured Gemini client retrieves production docs and uses the MCP
   or function connection to read an existing event/team/game. Record tool
   selection, returned identifier/source and final answer; do not fabricate a
   passing result without a credentialed model invocation. Fetching a URL alone
   and consumer Gemini automatic tool discovery are separate claims.
5. Verify the production site in Search Console, submit its sitemap and record
   URL Inspection/indexing evidence. Track organic discovery separately; HTTP
   success or a Gemini tool test cannot guarantee ranking/recommendations.

Cloudflare references:
[Worker environments](https://developers.cloudflare.com/workers/wrangler/environments/),
[static asset routing](https://developers.cloudflare.com/workers/static-assets/binding/),
[remote MCP on Workers](https://developers.cloudflare.com/agents/model-context-protocol/guides/remote-mcp-server/).

### Implementation underway after approval

The user approved implementing and deploying the proposal. Static help and the
Fetch-based SDK MCP handler now run together under workerd. Staging local checks
passed all 39 pages plus MCP documentation and six actual staging application
reads. Root typecheck/lint and five focused repo tests passed. Environment tests
reject mixed staging/production targets and application bindings. The editor
remains excluded from deployment; root app files/dependencies are not changed.

Correction to the earlier public-API blocker: source review of deployed commit
f936324 showed its schema lives at /openapi.json with /api-prefixed paths. The
bridge now supports that specific legacy shape after a 404 at /api/openapi.json,
and six production public reads passed. **An application redeployment is not
required for these reads.** Earlier conclusions requiring an app release are
superseded by this measured compatibility result.

Workerd exposed two integration differences that the Node proof could not:
Wrangler's local upstream URL uses the configured hostname with HTTP, and
Cloudflare rejects fetch redirect:error. Host validation now compares the exact
configured hostname; manual redirect mode checks non-success statuses and never
follows redirects. These are our adapter fixes, not asserted upstream defects.
The response/request readers enforce byte limits while streaming. Cloudflare's
rate limiter caps MCP/proxy requests; public API contract caching is bounded to
15 seconds, without caching application data or credentials.

The CLI provides explicit check/deploy/status/rollback/gemini environment actions.
A release checks app-reported environment and its deployed schema, builds its
own artifact, records app version/contract digest, tests locally, then publishes
only help and verifies its build ID. Actual external deployment, rollback and
Gemini evidence will be added below; they are not implied by local tests.

Staging first published as Worker version
89a80512-804e-443f-92d8-04b247c1b6b4. Its initial CLI verification timed out on
local OS NXDOMAIN, although public DNS and Chrome served the new hostname.
Browser HTTPS checks confirmed the staging identity, noindex and an actual
proxy GET returning four staging events. The shared probe now logs and handles
this specific negative-cache mismatch using public DNS with normal original-host
TLS verification; no hostfile/environment overrides or certificate bypasses.
Shared status subsequently verified the deployed identity and application reads.
The original timed-out deployment is not retroactively described as a passing run.

### Deployment and final verification — 2026-09-09

- Production: https://help.remy.ubuntusoftware.net/; Worker remy-help;
  version 38c3f1fa-617d-4be9-9299-f6667049dca6; build
  2026-09-09T06:36:54.916Z, help source revision 0b483b6. It calls only
  https://remy.ubuntusoftware.net, whose existing build remains
  2026-09-03T04:15:32.014Z. No app deployment or database change was performed.
- Staging: https://staging-help.remy.ubuntusoftware.net/; Worker
  remy-help-staging. Verified rollback restored version
  b03d49c8-5f78-4b95-abab-7bd62e8b860e and build
  2026-09-09T05:24:47.789Z (help revision 0dd547c), then repeated the external
  protocol/API tests. It calls only the existing staging app build.
- Production check/deploy passed all 39-page workerd audits, three-language MCP
  search, guide retrieval, six real public application reads, same-origin proxy,
  unknown/write/body-limit rejection, correct identity and no reserved canonical
  URLs. Production HTTP/meta noindex is absent; staging retains it.
- The final public discovery probe passed HTTPS pages, Markdown exports,
  sitemap, robots and the six application reads. Chrome independently loaded
  production and verified its canonical URL, six-operation schema and public
  event response. Cloudflare bindings contain assets, metadata and rate limit,
  plus non-secret environment URLs; none of the app's data/services bindings.
- Each completed deployment/rollback reported 2,464 app/dependency fingerprints
  unchanged. A killed rollback preflight was retried before mutation; a killed
  production preflight stopped before publication. Command timeout/progress
  diagnostics were improved; failed attempts are not counted as passing runs.
- Local author command now runs Vite at 8791, the actual Worker transport at
  8792 and Studio at 8793, with automatic protocol/API checks. It verifies the
  public-document URL handling and rejects app-source access through the help
  proxy. Dev-only connection links now point to the local Worker. These local
  follow-up fixes do not change the already verified remote deployments.
- Five focused repository tests passed. Typecheck/lint passed before deployment.
  A later root typecheck encountered transient concurrent app JSX edits outside
  the help changes; they were left untouched and the subsequent result is
  recorded below rather than attributed to help.

Remaining external acceptance: `bun run ops docs gemini --env production`
refused because GEMINI_API_KEY was absent from environment and fnox. No model
call was run or claimed. Search Console opened its public about/login page;
there is no authenticated property access here, so no sitemap submission or
indexing proof was claimed. The user was asked to configure the key and confirm
Search Console domain verification. Sitemap to submit once access is available:
https://help.remy.ubuntusoftware.net/sitemap.xml. No extra content work was done.

Follow-up on the reported app typecheck failures (2026-09-09): the concurrent
UI migration completed its Row/RowGroup imports and tags. Root typecheck, lint,
production build and model check now pass. The full unit/repository/Worker run
passed 933 tests and identified one outdated heading guard: the migrated shared
topbar now owns PageHeader's h1. The guard now permits only that topbar h1 at
the registry's text-base size, retaining checks on other headings and captions;
all 17 style tests pass on retry. This is an app integration check correction,
not a Fuma upstream bug. The five help/repository tests and actual
dev/staging/production Worker checks passed independently.

Final follow-up validation: a subsequent unit/repository/Worker run passed 933
of 934 tests, with only abbreviated dependency paths in the newly added MoQ plan
failing documentation validation. Expanded those to verified full package paths;
the documentation and style suites then passed all 19 tests. The final browser
run passed 345 of 346 tests; the remaining assertion accidentally matched the
team-name abbreviation instead of the division label. Corrected it to check
"Under 18 Girls" and all 21 team rendering tests passed on retry. Root typecheck
also passed after the final header edits. Results are from full runs plus focused
retries, not a claim that a single uninterrupted `bun run check` passed. The UI
migration and its title/selector corrections are tracked in plan 07; these local
verification fixes required no deployment or database changes.
