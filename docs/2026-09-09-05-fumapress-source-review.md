# Fumapress source review for Remy Sport

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
