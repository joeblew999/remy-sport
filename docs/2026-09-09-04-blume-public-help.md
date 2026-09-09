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

Fumapress 1.2.0 builds three sample pages in static mode. Its Cloudflare config
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
- Static Fumapress build succeeded; Wrangler dry-run read 55 public assets.
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

## Remaining work

This establishes a small local build/serving proof, not production readiness.
The real hostname, final user documentation, browser interaction/search quality,
accessibility, multilingual review and release authorization remain open. No
Gemini discovery test was performed.

Before adding an editor, run the separate authoring proof described in the
[source review](2026-09-09-05-fumapress-source-review.md). The editor's storage,
authorization and publishing workflow are additional work; they are not hidden
requirements of the current public-help build.

References: [Fumapress/editor source review](2026-09-09-05-fumapress-source-review.md)
and [oRPC/Blume measurements](2026-09-09-03-orpc-blume-review.md).
