# Fumapress source review for Remy Sport

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
