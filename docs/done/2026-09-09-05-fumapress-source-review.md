# Fumapress source review for Remy Sport

Archive: superseded (2026-09-09). Source review delivered; integration and external discovery continue in 2026-09-09-04-blume-public-help.md.

Current work: [project index](../README.md). Original evidence follows.

This file records the earlier source inspections. The subsequent implemented
isolation proof and current status are in the
[public help plan](2026-09-09-04-blume-public-help.md); its results supersede the
"not installed/built" limits below for the small Fumapress proof only.

Reviewed 2026-09-09. Recommendation: evaluate Fumapress first for public help;
Blume becomes the alternative. The shared dependencies are substantially closer
than the earlier documentation-only comparison established. Integration remains
unproven: this review cloned and inspected source, without dependency installation,
building, runtime tests or changes to Remy's application.

## Checkout and reproduction

Local checkout: `/private/tmp/remy-fumapress-review-20260909`.
Requested branch: `dev`. Reviewed commit:
`8bb4f58599b2b1c0330338c13f4a45acc5ad2366`.
Core manifest version: 1.2.0; that does not establish that this exact commit is
published on npm.

Clone command: `git clone --depth 1 --branch dev https://github.com/fuma-nama/fumapress.git /private/tmp/remy-fumapress-review-20260909`.
The branch moves; the commit identifies the reviewed source. The checkout is
reference material, never a Remy build dependency. Its root AGENTS.md describes
Tegami release rules. Its root scripts use Turbo and Vitest; packageManager is
pnpm 11.1.1 and Node requirement >=24. These are upstream contributor tools,
not a reason to replace Remy's existing Bun/mise setup.

## Actual overlap

These are declared dependency ranges from Remy's `package.json` and the
Fumapress core/docs manifests, not proof of identical installed dependency trees.

| Package | Remy | Fumapress core or docs app |
| --- | --- | --- |
| React / React DOM | ^19.2.8 | ^19.2.8 |
| Vite | ^8.2.2 | ^8.2.2 |
| Tailwind / Tailwind Vite plugin | ^4.3.3 | ^4.3.3 |
| Base UI | ^1.8.0 | ^1.8.0; docs aliases fumadocs-ui to @fumadocs/base-ui |
| Zod | ^4.5.4 | ^4.5.4 |
| class-variance-authority | ^0.7.1 | ^0.7.1 |
| cn | ^0.2.6 | ^0.2.5 |
| Lucide React | ^1.42.0 | ^1.40.0 |
| Hono | ^4.13.7 | ^4.13.5 development dependency; optional peer |
| TypeScript | 7 | ^7.0.2 in core/docs |

[Core manifest](https://github.com/fuma-nama/fumapress/blob/8bb4f58599b2b1c0330338c13f4a45acc5ad2366/packages/core/package.json),
[docs manifest](https://github.com/fuma-nama/fumapress/blob/8bb4f58599b2b1c0330338c13f4a45acc5ad2366/apps/docs/package.json).

Hono is more than a manifest name: the router accepts Hono middleware and app
interfaces. This is useful architectural overlap, though it does not demonstrate
that its generated server can be mounted directly in Remy's Worker.
[Router source](https://github.com/fuma-nama/fumapress/blob/8bb4f58599b2b1c0330338c13f4a45acc5ad2366/packages/core/src/router/index.tsx).

The React/Base UI/Tailwind match should reduce styling and tooling differences.
Use maintained Fumadocs Base UI components first; sharing packages does not mean
sharing application roots, global CSS, authentication state or all UI components.

## Packaged features confirmed in source

The recommended preset includes sitemap, robots, LLM output and search.
Static mode prerenders pages and provides a downloadable search index.
Proposed proof settings: `mode: "static"` in press config and
`press({ basePath: "/help/" })` in its separate content Vite configuration.
The actual emitted paths, including search and RSC assets, still need testing.
[Preset implementation](https://github.com/fuma-nama/fumapress/blob/8bb4f58599b2b1c0330338c13f4a45acc5ad2366/packages/core/src/app/plugin.ts),
[deployment documentation at reviewed commit](https://github.com/fuma-nama/fumapress/blob/8bb4f58599b2b1c0330338c13f4a45acc5ad2366/apps/docs/content/docs/deployment.mdx).

The LLM plugin supplies per-page Markdown. Its Accept-header redirect is ignored
in static mode. MCP explicitly throws in static mode; it needs a runtime.
These boundaries match the initial static help scope. The upstream docs app
enables MCP and includes sponsor/CMS packages, so do not copy that app wholesale.
[LLM plugin](https://github.com/fuma-nama/fumapress/blob/8bb4f58599b2b1c0330338c13f4a45acc5ad2366/packages/core/src/plugins/llms.txt.ts),
[MCP plugin](https://github.com/fuma-nama/fumapress/blob/8bb4f58599b2b1c0330338c13f4a45acc5ad2366/packages/ai/src/mcp.ts).

## Remaining differences and concrete concerns

- React Email clarification, checked against the current working tree on
  2026-09-09: Remy already renders React inside the Cloudflare Worker. The email
  renderer in `src/mail/templates/render.tsx` imports `renderToStaticMarkup`
  from `react-dom/server` and produces an HTML string. This is static server-side
  rendering, distinct from React Server Components. The current Vite config,
  package manifest and Bun lock show no Waku/RSC plugin or transport setup.
  Thus React-on-Cloudflare is already part of our architecture; the additional
  integration to prove is specifically Waku's RSC build and routing pipeline.
  [React static markup API](https://react.dev/reference/react-dom/server/renderToStaticMarkup),
  [React Server Components](https://react.dev/reference/rsc/server-components).
- Waku is pinned to 1.0.0-rc.0. The CLI constructs Waku/RSC build environments;
  the Vite integration includes handling for duplicate Waku resolution. This
  differs from Remy's Cloudflare Vite pipeline. Use separate build configurations
  behind one team command and assemble the validated static output for one release.
- Remy's Sharp override is 0.35.2. Fumapress core's optional Sharp peer is
  ^0.34.0, but its own development/docs dependency is ^0.35.4. Both 0.35 versions
  are outside that peer range. This is a concrete upstream manifest inconsistency
  to resolve in the install proof, not a tested runtime failure. Do not silently
  change Remy's override or force resolution; omit optional optimization if unused.
- It uses Fuma Translate/Fumadocs localization. No direct manifest overlap was
  found for Paraglide, oRPC, Better Auth or Drizzle. Keep Remy's translations and
  authenticated application architecture authoritative.
- Its Cloudflare adapter can generate deployment configuration and headers.
  Build in the content directory, never let it alter Remy's root Wrangler config,
  and validate namespaces, headers, redirects and 404 behavior before assembly.
- Package names alone cannot establish Bun lock compatibility, smaller bundles,
  faster builds or Gemini discovery quality. None was measured in this review.

[Vite integration](https://github.com/fuma-nama/fumapress/blob/8bb4f58599b2b1c0330338c13f4a45acc5ad2366/packages/core/src/vite.ts),
[CLI](https://github.com/fuma-nama/fumapress/blob/8bb4f58599b2b1c0330338c13f4a45acc5ad2366/packages/core/src/cli.ts),
[deployment enhancer](https://github.com/fuma-nama/fumapress/blob/8bb4f58599b2b1c0330338c13f4a45acc5ad2366/packages/core/src/router/deploy.enhancer.ts).

## Next step

Run the [public help integration proof](2026-09-09-04-blume-public-help.md) with
Fumapress first: three portable Markdown pages, existing Bun/mise automation,
isolated content build, `/help/`, static output and one release artifact.
Check dependency resolution and the Sharp mismatch before expanding content.
The route, offline-cache, notification-tab, staging-noindex and retrieval checks
in that plan apply equally to Fumapress. Retain Blume as the alternative if the
proof needs substantial framework patches. No final adoption or deployment yet.

## Fumadocs Editor: local source review, 2026-09-09

User supplied the editor's dev branch after the framework comparison. Cloned to
`/private/tmp/remy-fumadocs-editor-review-20260909` at commit
`3976d98d01730febef1c78767d370c7826f898b8` using
`git clone --depth 1 --branch dev https://github.com/fuma-nama/fumadocs-editor.git /private/tmp/remy-fumadocs-editor-review-20260909`.
Source inspected only; no dependency installation, build, runtime or round-trip
tests were run. No AGENTS.md was found in this checkout. Its root README lists
pnpm install/dev/test/build; root pins pnpm 11.5.3 and Node >=24.

This complements Fumapress by supplying visual MDX authoring. Its own docs app
uses Fumapress ^1.2.0, React ^19.2.8, Vite ^8.2.2, Tailwind ^4.3.3 and the
Fumadocs Base UI variant. That is direct ecosystem integration, not just similar
package names. The editor itself uses React 19 and Base UI ^1.6.0, but also adds
TipTap/ProseMirror and StyleX; it is not purely our Tailwind component stack.
[Docs manifest](https://github.com/fuma-nama/fumadocs-editor/blob/3976d98d01730febef1c78767d370c7826f898b8/apps/docs/package.json),
[editor manifest](https://github.com/fuma-nama/fumadocs-editor/blob/3976d98d01730febef1c78767d370c7826f898b8/packages/ui/package.json).

Three packages have distinct jobs:

- Core parses/serializes MDX and provides synchronization and collaboration tools.
- UI supplies the React visual editor (manifest version 0.2.0).
- Studio provides a browser interface for editing a local directory (0.1.2).
  It autosaves files; this is separate from committing or publishing them.

Upstream calls the project experimental with breaking changes expected before
v1. The UI claims byte-preserving serialization for untouched blocks. Its
documented limits include verbatim-only handling of some tabs and footnotes,
disabled raw MDX editing during collaboration, and loss of edits typed while
the collaboration server was down when it restarts. These are upstream-reported
limits, not failures reproduced in this review.
[README](https://github.com/fuma-nama/fumadocs-editor/blob/3976d98d01730febef1c78767d370c7826f898b8/README.md),
[known limits](https://github.com/fuma-nama/fumadocs-editor/blob/3976d98d01730febef1c78767d370c7826f898b8/apps/docs/content/limits.mdx).

The provided sync server uses Node filesystem APIs, chokidar and ws. It assumes
a writable content directory and is not a ready-made Cloudflare content store.
The UI supports custom save/transport integrations, but hosted use would require
an explicit persistence, revision and publishing design. Its authentication hook
defaults to allowing writes when absent; local dev defaults must not be exposed
through Remy's remote tunnel without an access policy. Existing Better Auth
sessions are not automatically wired into this editor.
[Sync implementation](https://github.com/fuma-nama/fumadocs-editor/blob/3976d98d01730febef1c78767d370c7826f898b8/packages/core/src/sync/node.ts),
[sync documentation](https://github.com/fuma-nama/fumadocs-editor/blob/3976d98d01730febef1c78767d370c7826f898b8/apps/docs/content/sync.mdx).

Recommendation: optional local authoring proof after the static Fumapress proof.
Keep the editor out of public help and the main app bundle. Scope its root
explicitly to public content: Studio otherwise falls back through content/docs,
content, then the current directory. Integrate through shared automation with
automatic startup/cleanup; do not require manual coordination with preview.
Prove save/reopen, frontmatter, links, images, unknown MDX, untouched-block
preservation, external-edit conflicts and process restart before regular use.
The editor sync guide warns of watcher reloads when mirrored files are imported;
test editor/preview isolation rather than ignoring the public-content watcher
globally and accidentally disabling Fumapress rebuilds.

Use ordinary editing first. Collaboration and hosted CMS use remain separate
decisions. Saved content must still pass the same repository review, content
validation and release workflow; autosave must never mean automatic publication.

### Cloudflare hosting feasibility

User asked whether the editor can run on Cloudflare. Assessment: feasible with
an adapted persistence layer, not an unchanged Studio deployment. The React UI
runs in the browser and can be served with Remy's assets. Its simple API accepts
MDX and calls onChange; the richer SyncTransport interface exposes list, read,
version-checked write and watch. A Worker backend can implement those contracts.
This has not been built or deployed here.

The existing Node sync server's filesystem model is the mismatch. Workers now
support node:fs, but their writable temporary files are nonpersistent; deploying
that server does not create a durable Git checkout or save back into the repo.
[Cloudflare filesystem documentation](https://developers.cloudflare.com/workers/runtime-apis/nodejs/fs/).

For a hosted proof, prefer a lazily loaded authorized editor screen, the existing
Better Auth/oRPC authorization path, and D1 draft/revision records with atomic
version checks. Reuse R2 for uploaded media if needed. Keep Save and Publish
distinct. To retain static Fumapress publishing, approved revisions must become
an immutable content snapshot consumed by the shared build/deploy workflow;
they cannot update deployed static assets merely by saving a database record.
Specify that handoff and the content source of truth before implementing hosted
editing. Do not introduce bidirectional Git/database synchronization implicitly.

If simultaneous collaborative editing becomes required, Durable Objects provide
coordination, persistent storage and WebSockets. Adapting the editor's Yjs
protocol, durable save acknowledgements and recovery would still be work;
hibernation alone does not persist editor state. No Durable Object is required
for the initial version-checked save workflow.
[Cloudflare WebSocket guidance](https://developers.cloudflare.com/durable-objects/best-practices/websockets/).

Treat authored MDX as executable build input: initially limit authors to trusted
content administrators and validate the allowed syntax/components before the
build. Hosted access must be enforced on reads, writes, uploads and publishing.
The local-first recommendation remains the smallest proof; hosted editing is a
feasible follow-on, not blocked by an inability to serve the React editor.

## Upstream bug and workaround register

Recorded 2026-09-09 from the implemented proof, commit `c06aeba`. These are
issue-ready local records, **not submitted upstream**. No issue/PR URL exists yet;
current upstream issue status has not been checked. Check for an existing issue
and reproduce on an upstream candidate version before filing or proposing a PR.
Keep the observed published version distinct from the earlier dev-branch review.

Environment: macOS arm64; Node 26.8.1; Bun 1.4.0; Fumapress 1.2.0;
Waku 1.0.0-rc.0; Vite 8.2.2; React 19.2.8; Fumadocs Core 16.15.7;
Fumadocs MDX 15.4.0; Wrangler 4.129.0. The exact dependency resolution is in
[the isolated lockfile](../../sites/help/bun.lock).

### FUMA-001 — Markdown handler mutates reusable route parameters

**Target:** Fumapress LLM plugin. **Status:** reproduced; local workaround verified;
upstream fix not submitted. User impact: a second fetch of the home Markdown
can return 404, breaking repeated Copy Markdown requests and build link checking.
Static generation can emit a valid file even though subsequent handler calls fail.

Reproduction in this repository:

1. Use the isolated package at commit `c06aeba`, with its committed lockfile.
2. Temporarily remove only the `remy-preserve-route-params` plugin from
   [press.config.tsx](../../sites/help/press.config.tsx). Keep the LLM plugin,
   static mode, root content page and internal link checker enabled.
3. Run `bun run ops docs dev` from the repository root. Its readiness check
   fetches the root Markdown twice; the unfixed handler can fail this check.
   In an upstream minimal app, request `/index.md` twice sequentially from
   the same running Fumapress dev server.
4. Expect both requests to return 200 and the same Markdown. Before the fix,
   a later request returned 404. Restore the plugin after reproducing.

Cause found in the installed Fumapress 1.2.0 package, LLM plugin static handler:
`const slugs = params.slugs` aliases the route array. The root case calls
`slugs.pop()`, changing the stored array from `["index.md"]` to `[]`; a later
call takes the empty-slugs not-found branch. Other paths also mutate their last
segment and the locale case shifts the array. The source location is
[packages/core/src/plugins/llms.txt.ts](https://github.com/fuma-nama/fumapress/blob/8bb4f58599b2b1c0330338c13f4a45acc5ad2366/packages/core/src/plugins/llms.txt.ts) in upstream; inspect the published package
when comparing because the dev branch is not necessarily the published artifact.

Proposed narrow upstream change (not an upstream-tested patch):

```diff
- const slugs = params.slugs;
+ const slugs = [...params.slugs];
```

Regression test to add upstream: invoke the static Markdown handler twice with
the **same context object**, verify identical successful bodies, and assert the
original params remain unchanged. Cover root, a nested page and locale-prefixed
pages. Those extra nested/locale cases have not been independently tested here.

Local fix: the `remy-preserve-route-params` plugin clones API params at the
supported route-registration hook before delegating to the original handler.
This is broader than the proposed upstream one-line change, but avoids modifying
installed packages. Verification: dev startup checks two root requests; Chrome
then made three more sequential requests, all 200 with the correct Markdown.
The full static/workerd audit and internal link validation passed, with no
root-Markdown exemption remaining. App/dependency fingerprints stayed unchanged.

Removal criterion: upgrade the isolated lockfile to a release with the upstream
fix, remove our cloning plugin, then pass repeated dev requests and the full
`bun run ops docs check` workflow. Record the release and issue/PR URL here.

### FUMA-002 — Generated CSS preload uses an invalid resource type

**Target:** Fumapress/Waku HTML generation, ownership not yet localized.
**Status:** observed in production output; not fixed locally; not submitted.

Reproduction: run `bun run ops docs preview` and open the displayed local URL
in Chrome. Inspect the generated head and browser console. The generated root
HTML at the recorded commit contains (asset hash is build-specific):

```html
<link rel="preload" href="/assets/app-D76euBG1.css" as="stylesheet"/>
```

Chrome reports: `<link rel=preload> must have a valid as value`.
Expected: CSS preload uses `as="style"`, while the actual CSS application uses
`rel="stylesheet"`. Observed impact is an invalid preload/browser warning;
the separate stylesheet loads and desktop/mobile layout renders correctly.
No measured performance regression or missing styling is claimed.

Next upstream work: locate the renderer producing this tag, reproduce without
our custom metadata plugin, and add a generated-head regression check before
changing it. Route the issue to Waku if its renderer owns the tag. We have not
patched generated HTML or dependency code to hide the warning.

Removal criterion: a verified dependency release generates a valid CSS preload
and a production-browser check no longer reports this warning. Preserve the
issue/PR and release references here when available.

### Integration fixes — do not misreport these as upstream defects

| Finding | Our fix and evidence | Upstream relevance |
| --- | --- | --- |
| Our Vite isolation guard treated `/api/search` as a filesystem dependency and returned 500 | Allow only that exact HTTP route probe; browser search returned results and navigated correctly | Local guard bug; no established upstream defect |
| Extensionless static search output lacked a JSON response type in our Cloudflare setup | Explicit `/api/search` Content-Type in the help package’s headers; HTTP audit requires JSON | Candidate deployment-documentation improvement; adapter ownership/default expectations need confirmation |
| Vite config server headers did not reach Fumapress’s outer dev server | Set local noindex/nosniff headers in our configureServer middleware; dev readiness checks noindex | CLI composition behavior; not yet established as a broken supported configuration contract |
| A terminated CLI left its detached development child running | Keep live server in the process group and add exact-command recovery through `bun run ops docs stop`; stop/restart verified | Our process-management bug, not Fumapress |

For future fixes, add the package/version, reproduction, expected/actual result,
local change, regression evidence, upstream submission status and removal condition
here before treating the workaround as finished. Link code workarounds back to
this register. Do not describe an unsubmitted local record as an upstream report.

### FUMA-003 — Blog tag with spaces fails internal link validation

Observed while implementing news with Fumapress 1.2.0 at this register’s pinned
environment: a tag `Local preview` generated a link ending in `/updates/tags/Local preview`.
The build link validator reported that route not found for all three locales.
Using URL-safe tags `help` and `local-preview` passed. No dependency patch was
made. This is a reproduced integration symptom; whether the underlying fault
is tag encoding, route matching or the validator remains unlocalized.

Reproduce by replacing `local-preview` with `Local preview` in the release-note
frontmatter and running `bun run ops docs check`; restore the slug afterwards.
Expected: generated links resolve for supported tag strings, or invalid values
are rejected explicitly. Upstream regression should cover tags containing spaces
and non-Latin characters. No issue/PR submitted. Our content convention is to
use URL-safe tag identifiers until this case is resolved upstream.

### Additional integration evidence from the feature expansion

- The default LLM index follows the default-language page tree and omitted the
  other locales and a folder overview. Our index now enumerates every loader
  page, grouped by language; the audit checks exact coverage. This is a deliberate
  index policy, not a claim of a broken documented upstream contract.
- Processed Markdown preserves MDX wrappers by default. We configured Fuma’s
  supported stringifier to retain prose, card links and headings while removing
  component wrappers. Interactive troubleshooting has a complete textual
  equivalent in each locale. The audit rejects raw executable/MDX markup.
- Default Takumi fonts produced missing-glyph boxes in Japanese social images.
  Locally vendored OFL font subsets fix Thai/Japanese rendering. This requires
  font configuration, not an upstream bug patch; a default-font documentation
  improvement may be useful. Font licences and sources are stored with the assets.

### Which upstream tool does the work

Fumapress’s installed CLI handles `dev`, `build` and `start`. Our shared ops CLI
calls it inside the isolated package and adds dependency/boundary checks,
Cloudflare preview and verification. `@fumadocs/cli` handles component-source
installation, layout customisation and file-tree generation; packaged Fuma UI
imports currently avoid the need to copy/customise that source. Studio’s own
`fumadocs-studio` CLI is the editor launcher. Content-specific guides,
locale policy and isolation audits remain our implementation work.

The MCP companion uses the official protocol SDK against the generated help
catalogue. Fuma’s MCP plugin explicitly requires a non-static Fumapress runtime;
the separate SDK service preserves our static public-site boundary without
installing the AI/chat dependency bundle or duplicating the whole Fumapress app.
[Official Fumadocs CLI](https://www.fumadocs.dev/docs/cli),
[official MCP SDK v1 server guide](https://ts.sdk.modelcontextprotocol.io/server).

### Editor boundary and integration evidence

Pinned Studio 0.1.2 / core 0.2.0 source uses lexical path containment; that alone
cannot prevent an existing content symlink from resolving outside the root.
This is a source-review concern, not a reproduced exploit against an unmodified
upstream server. Our authentication hook checks every path segment with lstat,
rejects symlinks and hidden/traversal paths, and permits only existing MD/MDX
files beneath the resolved help-content root. An isolated fixture verifies
symlink, traversal and cross-origin rejection. No upstream issue submitted;
a prospective upstream fix should enforce real-path containment at file access.

The official Studio CLI runs on loopback with uploads disabled. Verification
covers all 33 authored documents round-tripping without changes, opaque MDX,
save conflicts, filesystem watching, two-peer collaboration and saved data after
server restart. Browser verification saved a temporary edit, saw Vite update the
open help page without reload, reopened Studio and restored the source; both
views observed the restoration. Unsent collaboration edits during a server
outage remain an upstream limitation; collaboration is off by default.

Our shutdown recovery initially treated an already-exited companion (ESRCH) as a
failure after its supervisor stopped it. Recovery now tolerates that normal race
while surfacing other errors. This is our process-management fix. Node 26 emits
an upstream localStorage experimental warning at Studio startup; it does not
prevent the verified workflow, and no hidden Node flags suppress it.

### Cloudflare adapter verification

The isolated public Worker uses SDK 1.30.0's Web Standard Streamable HTTP
transport in finite JSON/stateless mode. The local workerd protocol test passed;
there was no need to install a second MCP framework. Two adapter issues were
fixed locally: compare configured hostnames across Wrangler's local HTTP URLs,
and use fetch manual redirects with explicit status rejection because workerd
does not implement redirect:error. Neither issue is reported as a Fuma bug.
The shared Wrangler helper can explicitly clear ambient environment selection
for already-resolved component configs, preventing environment suffix drift.

The dev Worker also exposed Waku probing locale page URLs as filesystem modules.
The Vite guard now permits non-existent filesystem paths only when they match
the public locale URL namespace; existing absolute files still undergo the
package boundary check. Dev verification includes a rejected request for the
app's source file through the help proxy. This extends the earlier /api/search
integration fix without allowing arbitrary app imports. MCP search also now
weights guide descriptions, after a Worker test found sign-in could fall outside
the default top five email results. These are local integration fixes.
