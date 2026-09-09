# Blume for public Remy Sport help

Status: proposed, 2026-09-09. No Blume dependency, application change or deployment
is part of this planning change. The next implementation step is the bounded
integration proof below, not a full documentation migration.

## Recommendation

Use Blume to generate public product and help pages under `/help/`, delivered
with the existing Worker asset bundle. Start with static HTML, Markdown, a
sitemap and local search. Keep one setup command, one development command and
one release pipeline. Prefer standard Blume configuration and its default theme.

This fits the immediate goal: people and assistants can find what Remy Sport
does and read accurate instructions. It does not require an AI chatbot, an
additional runtime, model credentials or a documentation MCP server initially.
Those are separate capabilities whose operational cost needs a demonstrated use.

Google says its Search AI features use ordinary indexing and snippet eligibility;
special AI files are not required and inclusion is not guaranteed. This guidance
is about Google Search, not proof that the Gemini app will recommend Remy Sport.
Measure Gemini discovery separately from whether a supplied URL can be read.
[Google guidance](https://developers.google.com/search/docs/appearance/ai-features).

## Evidence and limits

The [oRPC review](2026-09-09-03-orpc-blume-review.md) records a successful local
build and retrieval tests, plus shortcomings in code search and version context.
Its checkout is `/private/tmp/remy-orpc-review-20260909`; that is reference
material, never a Remy build dependency. It tested Blume 1.5.3. Newer upstream
discovery features have been researched, not runtime-verified here.

Blume documents static output and two different mounting options. Use
`deployment.base` with `/help`, which scopes the whole generated site, rather
than `basePath` alone, which leaves public assets at the origin root. Explicit
Markdown URLs provide static retrieval; same-URL Markdown negotiation is a
server feature and must not be promised by this first phase.
[Blume deployment reference](https://useblume.dev/docs/deployment).

The Remy integration remains unproven until its actual generated artifact passes
the acceptance checks. In particular, confirm output layout, headers, redirects
and Bun dependency resolution rather than assuming the oRPC deployment transfers.

## Boundaries that prevent problems

| Area | Required boundary |
| --- | --- |
| Content | A dedicated, explicitly selected public source directory. Never publish or index this internal `docs/` tree, plans, credentials, account data or live database records. |
| Application | Keep the React/Tauri app, hash links, authentication and API architecture. Link to Help from the app and back to the relevant app screen. |
| Routes | Only help assets under `/help/`. Origin-level discovery files are deliberate exceptions with a single owner. Preserve `/`, `/api`, `/rpc`, `/doc`, `/openapi.json` and `/.well-known/` behavior. |
| Build | Build into a separate output directory; validate it before merging into the final asset artifact. Never let Blume write into Vite's output while Vite is building or watching. |
| Dependencies | Use the existing Bun lock and root mise pins. Pin the evaluated Blume release. Do not import the reference checkout's pnpm setup or upgrade Remy's oRPC to match it. |
| Runtime | No Astro Worker adapter in the first phase. Remy's Hono Worker remains the deployed entrypoint. |
| Offline | Explicitly exclude help output from app precaching. Check an already-installed PWA as well as a fresh browser. |
| Environments | Derive the site origin from the existing environment configuration. Staging help responses must carry effective noindex directives, including asset-first responses. |
| Maintenance | Use upstream defaults; avoid template copies, search patches and a Blume fork. Record failed acceptance checks here before expanding scope. |

Public source proposal: `src/content/`, with Markdown and a Blume configuration. <!-- docs-check-ignore -->
This directory does not exist yet. First try the dependency in the existing
package; introduce a Bun workspace only if a reproduced dependency conflict
requires it. A separate hostname/Worker is the fallback if supported subpath
output cannot pass the route tests without substantial custom code. Do not add
that infrastructure pre-emptively.

## Integration work, in order

1. **Prove the smallest useful site.** Pin and test a current stable Blume release
   with three pages: what Remy Sport does, signing in, and following a game.
   Check claims against implemented screens and permissions. Build static output
   under `/help/`, with its ordinary theme and local search. Record the exact
   release, commands and results here. No API documentation generation yet.
2. **Make the team commands own it.** Extend the existing setup, development,
   build and check workflows. A single `bun run dev` must start the necessary
   watchers, serve help at the application origin, report readiness and stop all
   children on failure or exit. No manually coordinated ports or copy commands.
   Keep Blume's output separate; use a scoped development integration. Production
   checks must exercise the assembled Worker artifact, not just Blume preview.
3. **Consolidate release builds.** `scripts/deploy.ts` currently invokes Vite
   directly after its checks. Make it and `bun run build` use the same shared
   build implementation so an environment rebuild cannot silently omit help.
   Build the app, build help separately, validate namespaces, assemble once,
   then test the final artifact before publication. Failed builds must not be
   deployable and removed pages must not survive from a previous build.
4. **Own discovery deliberately.** Publish the help sitemap and LLM index.
   Maintain one origin-level robots file advertising the sitemap and one
   origin-level `/llms.txt` pointing to public help. Reconcile generated header
   and redirect files explicitly instead of overwriting the app's rules.
   Add truthful titles, descriptions, canonical URLs and a visible product
   explanation. Link help from the application. Do not list hash routes as
   independent crawlable product pages.
5. **Validate staging, then release.** Use the existing deployment and smoke
   workflows with added help assertions. The app and help ship in one artifact;
   rollback uses the same release workflow and previous source revision. No
   separate content deployment or database migration is needed for this phase.

The exact internal command/module names are implementation choices; there must
not be a second public automation surface that developers have to remember.

## Required checks before adoption

- Fetch the built help pages with JavaScript disabled: the explanation and
  instructions must already be in HTML. Direct nested links, trailing slashes,
  images, search assets and explicit Markdown URLs must work under `/help/`.
- Missing help pages return a real 404. No request escapes to the SPA by
  accident, and no generated asset overrides an existing Worker endpoint.
  Extend `tests/repo/assets.test.ts` against the assembled output; do not weaken
  its collision protection. Its existing comments about build paths and whether
  `check` builds are stale and should be corrected when this work touches it.
- Check the service-worker manifest, help navigation and notification clicks
  with an installed PWA. `src/web/vite.config.ts` currently precaches HTML
  recursively; `src/web/sw.ts` may focus any same-origin window on notification
  clicks. A help tab must not become an unexpected replacement for the app tab.
- Validate canonical/sitemap origins, UTF-8 Markdown, header and redirect
  behavior on the actual Worker asset deployment. Staging noindex must not rely
  only on Hono middleware, which asset-first requests bypass. Never treat robots
  blocking as a substitute for an observable noindex response.
- Inspect the published search/LLM artifacts: only allowlisted public content,
  no internal plans or fixture data, no unsupported feature claims. Include the
  product name and relevant release/last-reviewed context in Markdown itself.
- Search the three initial user questions and require the correct page within
  the first three results. Test literal UI terms too. Expand to a committed
  question/expected-page set as content grows; do not infer MCP search quality
  from the browser search index.
- Prove a broken content link fails the shared check and prevents deployment;
  prove deleting a page removes its HTML, Markdown and search entry. Run the
  existing app checks and affected browser journeys before adoption.

## Content and later capabilities

Start with English pages verified against current behavior. Add reviewed Thai
and Japanese pages as a separate content step, using stable locale URLs and
correct language metadata. Reuse the app's terminology; do not create a second
catalog of UI labels or publish unreviewed machine translations as authoritative.
Application changes that alter a documented journey must update that page in the
same change. Screenshots supplement readable steps rather than replacing them.

After publication, check indexing in Search Console and record dated Gemini
tests: broad product discovery without a supplied URL, then specific usage
questions with the URL supplied. Record citations and incorrect answers; a local
retrieval success does not demonstrate external discovery or model training.

Add read-only documentation MCP only when a concrete client needs it. Evaluate
its release-specific code search, exclusions and resource discovery against the
same public corpus. Keep it separate from Remy's authenticated operational API.
An Ask AI feature would also need an explicit cost, rate-limit and failure design.
Neither is a prerequisite for this first release.

Next action: implement and measure steps 1–3 locally through shared automation.
Proceed to deployment only after the assembled artifact passes the checks above
and release is authorized. If the proof needs substantial framework patches,
stop expansion and record the incompatibility and alternative here.
