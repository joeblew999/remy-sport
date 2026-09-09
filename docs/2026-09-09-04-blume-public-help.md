# Public help: isolated Fumapress proof

Status: local proof implemented on 2026-09-09. This replaces the earlier proposal
to merge generated help into the app's Worker. The user's priority is protecting
the repository and application from documentation dependencies.

## Boundary

The independent package is [sites/help](../sites/help/package.json). It is not a
Bun workspace and has its own committed lockfile, node_modules, Vite configuration
and build output. There are no Fuma packages in the root manifest or lockfile,
no imports from the app into help, and no changes to the app's Vite or Wrangler
configuration. The editor, collaboration, CMS and runtime MCP are outside this proof.

Fumapress 1.2.0 builds six source-reviewed guides in static mode. Its Cloudflare config
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

This command validates the existing Bun pin, installs only the help package with
its frozen lockfile, checks local dependency resolution, removes stale help
output, builds, packages with Wrangler dry-run, starts local Cloudflare
emulation on a free loopback port, checks responses, and stops that process group.

It bypasses the app installer deliberately. App files, dependency manifests and
symlink targets are fingerprinted before and after, including existing uncommitted
app source. A change fails the command and names affected paths; it never resets
someone else's work. The docs Vite build also refuses module loads outside its
package. No inherited app credentials or deployment overrides are passed to
children. This measures the covered files; it is not a whole-filesystem audit.

`bun run ops docs preview` runs the same checks and keeps the verified preview
open until Ctrl-C. `bun run ops docs clean` removes only help dependencies and
generated output. Neither command deploys anything. Setup and cleanup need no
manually coordinated servers.

The generated result is in `sites/help/.proof/result.json`; it is not committed. <!-- docs-check-ignore -->
The module-path audit is beside it. The public content is deliberately outside
the internal `docs/` tree. Generated files and installed dependencies are ignored.

## Acceptance and evidence

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

- Six guides: overview, sign-in, games, notifications, phone installation and
  instructions for AI assistants. Content describes verified app behavior and
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
Current output: six guides, 1,100 bytes of LLM index and 9,005 bytes of full text.
The browser was checked at 390px width with no horizontal overflow; the mobile
sidebar opened and navigated to the selected guide. The shared stop command and
subsequent dev restart passed with 2,461 app/dependency fingerprints unchanged. A temporary
content marker was removed and disappeared through HMR without navigation or a
manual reload. The marker is not part of the committed content.

### Known limits and tracked upstream issues

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

## Feature roadmap

Prioritize features that improve authoring or answers without adding app coupling.
Each addition stays in this package or another independent authoring package and
must pass the shared automation and unchanged-app checks.

| Priority | Feature | Acceptance before enabling |
| --- | --- | --- |
| Next | Rich MDX callouts, steps, tabs and screenshots | Use where real guides need them; verify mobile layout and Markdown exports preserve the instructions. |
| Next | Local visual editor/Studio | Separate package and lockfile; one shared CLI command; save/reopen and conflict tests; writes restricted to public content; preview edits through the current dev server. |
| Next | English, Thai and Japanese guides | Human-reviewed translations matching app terms; locale search, canonical/hreflang and language-specific Markdown checks. |
| Later | Release notes and RSS | Real dated releases with useful changes; validate feed links and dates. |
| Later | Public API documentation | Explicitly allowlisted public schema; never dump private app APIs or credentials into static output. |
| Later | Read-only documentation MCP | Separate runtime and read-only content tools; prove protocol compatibility and bounds before adding a server. |
| Conditional | Feedback and AI chat | Defined moderation/storage, model budget and privacy requirements; no silent dependency on app auth. |
| Conditional | Collaborative CMS/editor | Persistence, authorization and restart/conflict recovery tests first; upstream demo defaults are insufficient. |

The editor’s storage and authorization requirements are described in the
[source review](2026-09-09-05-fumapress-source-review.md). They remain separate
from the working public-help build and live authoring workflow.

References: [Fumapress/editor source review](2026-09-09-05-fumapress-source-review.md)
and [oRPC/Blume measurements](2026-09-09-03-orpc-blume-review.md).
