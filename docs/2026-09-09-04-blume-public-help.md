# Public help: isolated Fumapress proof

Status: local proof implemented on 2026-09-09. This replaces the earlier proposal
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
