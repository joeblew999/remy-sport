# oRPC Blume documentation review

Archive: completed (2026-09-09). Runtime review delivered; no adoption claimed.

Current work: [project index](../README.md). Original evidence follows.

Status: runtime review completed, 2026-09-09. User requested cloning oRPC
and running its content app to assess LLM retrieval and product discovery.
No Remy Sport application changes are part of this review.

## Source and reproduction

- Upstream: https://github.com/middleapi/orpc
- Reviewed commit: `4d9956975cad6600d9b91071d1dfc816017f9997`.
- Disposable source checkout: `/private/tmp/remy-orpc-review-20260909`.
- Follow upstream `CONTRIBUTING.md`, workspace manifest and content scripts.
- Node 26.8.1 is installed locally; upstream pins pnpm 12.0.0.
- The clone originally had no mise file. A follow-up added the configuration
  below to its root; it is a local review addition, not an upstream change.
- The initial review used npm's standard package runner to launch pnpm because
  the existing global auto-switch launcher was an incomplete native installer.
  The verified mise setup below replaces that workaround.

### Mise setup added after the review

The complete clone-root configuration is recorded here so it survives disposal
of the temporary checkout:

```toml
[tools]
node = "26.8.1"
pnpm = "12.0.0"

[settings]
# Keep nested package scripts on the pins, ahead of global package managers.
activate_aggressive = true

[tasks.setup]
description = "Install the locked workspace dependencies with the pinned toolchain"
run = "pnpm install --frozen-lockfile --network-concurrency=1"
```

Use the native `pnpm` backend, not `npm:pnpm`: the latter left an unbuilt
pnpm 12 installer placeholder in this environment. That failed installation
was removed. Without `activate_aggressive`, nested pnpm calls selected the
broken Homebrew launcher even though a direct mise invocation used the pin.
The documented setting fixes precedence without changing the user's global
configuration or introducing a custom launcher.

Verified: `mise run setup` succeeds with Node 26.8.1 / pnpm 12.0.0 and the
frozen lockfile; `mise exec -- pnpm run docs:validate` passes including its
nested pnpm invocation. The earlier production build used these same versions.
Mise manages the tools; the setup task delegates package installation to the
upstream package manager and preserves its lockfile and policy checks.

## Verdict

Blume is a strong foundation for documentation that agents can retrieve.
The actual oRPC app builds and serves its HTML, Markdown, MCP and skills
successfully. This is a much stronger implementation than the first review
described. It still needs better MCP code search and consistent version
context before calling its agent experience reliable. Public Gemini discovery
and recommendation frequency were not measured.

## Verified local workflow

Run these from the cloned upstream repository with the mise file above.

```sh
mise run setup
mise exec -- pnpm run docs:validate
mise exec -- pnpm --filter @orpc/content run build
mise exec -- pnpm --filter @orpc/content run preview --host 127.0.0.1 --port 4325
# In another terminal while preview runs:
mise exec -- pnpm --filter @orpc/content exec blume audit --json
mise exec -- pnpm --filter @orpc/content exec blume audit --url http://127.0.0.1:4325 --json
```

Install succeeded without changing the lockfile. Serial downloads resolved the
network timeout problem. Strict validation passed: 212 docs-mentioned symbols,
345 documentation links, zero errors/warnings, and no broken content links.
The production build succeeded: 126 content pages, 45 configured redirects,
Cloudflare server output, Orama search, four published skills. The audit scans
129 HTML pages including custom pages. The sitemap contains 128 URLs.
Upstream Git status remained clean after the initial installation, build and
review. The follow-up adds only the local mise configuration described above.

## Runtime results

Chrome opened the production preview at `http://127.0.0.1:4325/docs/getting-started`.
HTTP responses were also inspected directly, without relying on client rendering.
The preview was left running for the user's inspection at the end of this
review; restart it with the command above if the process has since ended.

| Check | Observed result |
| --- | --- |
| HTML guide | 200, rendered heading and guide text already in response; canonical, description and TechArticle JSON-LD present. |
| Individual Markdown and MDX | Both 200; getting-started is 7,083 bytes versus 501,324 bytes of HTML, about 71 times smaller before compression. |
| LLM index and full text | Both 200; 23,863-byte index and 587,910-byte full text. Prefer targeted page retrieval over loading the whole corpus. |
| Content negotiation | Home and guide URLs return Markdown for `Accept: text/markdown`, with correct media type and `Vary: Accept`. |
| Discovery | Agent manifest, MCP discovery, skills index, sitemap and robots all return 200. |
| Skills | All four fetch successfully and match their advertised SHA-256 digests. |
| MCP | Initialization and all four tools work: search, page retrieval, page listing and navigation. Tools advertise read-only access. |
| Retrieval consistency | MCP's TanStack Query page equals the individual Markdown export and contains its code examples. |
| Missing page | MCP returns `isError` and tells the agent to search/list pages. A missing Markdown HTTP URL returns a genuine 404, but an empty body. |
| Legacy URL | Old HTTP adapter URL redirects to the Fetch API adapter page. |

### Retrieval problems and next fixes

1. **MCP misses code-only symbols.** Searching `onSuccess` (limit 5) returns
   only Next.js; TanStack Query is absent despite containing the example.
   Its browser search document does contain `onSuccess`. Reproduced both
   locally and on production. The custom code-index plugin transforms only
   browser search data; MCP independently generates its own index. Next fix:
   include code in the MCP index too, with a regression query for this case.
2. **Natural-language ranking is uneven.** “How do I invalidate queries after
   a mutation?” ranks the correct TanStack Query guide fifth, after unrelated
   guides. “Cloudflare Workers” and `createSafeClient` each find the relevant
   guide first. These are four deterministic search probes, not a benchmark
   of LLM answer correctness. Next: maintain representative question/expected
   page cases, including both API identifiers and user-language questions.
3. **Version context is inconsistent.** The human page has a v2-beta banner;
   the Markdown guide and LLM index do not repeat it. MCP initialization has
   no version instructions; its server version is Blume 1.5.3, not oRPC's
   version. A `version: "v1"` search still returns current v2 pages because
   this site does not configure Blume's archived versions. This matches the
   tool's documented behavior on unversioned sites, but is easy to misuse.
   Next: state API version in MCP instructions and agent-readable content,
   and explicitly direct v1 callers to https://v1.orpc.dev. The four skills
   already explain version compatibility, which helps when agents load them.
4. **The index does not advertise all agent features.** Its text has no MCP
   URL, skills URL or v1-site URL. Those features are discoverable through the
   separate agent manifest, but an agent starting with only the LLM index may
   miss them. The homepage's Markdown response is this same index, rather
   than the landing page's product explanation. Next: put product use cases,
   version guidance and agent-resource links into the machine-readable entry.
5. **Examples retain authoring scaffolding.** Markdown and MCP retain
   Twoslash fixture imports, cut markers and package-install fences. Code is
   readable but not uniformly ready to copy into a standalone project. Next:
   distinguish example prerequisites from hidden type-checking scaffolding.

These are upstream findings; no upstream changes or PR were made. If using
Blume for Remy Sport, the next implementation should address these cases in
the shared docs workflow rather than copying the site without verification.

### Built-in audit, interpreted

Static audit: **0 errors, 589 warnings**, across 129 HTML pages.

| Warning | Count | Meaning |
| --- | ---: | --- |
| Absolute internal links | 516 | Mostly repeated links to the production LLM files; preview users are sent to production. Not 516 distinct content defects. |
| No incoming body links | 28 | Pages remain linked from navigation; contextual links would improve discovery. They are not completely unreachable pages. |
| Description length | 31 | Editorial guidance. |
| Title length | 3 | Editorial guidance. |
| Images without dimensions | 6 | Potential layout stability issue, not measured Core Web Vitals. |
| Pages absent from LLM index | 5 | All five blog pages explicitly set `ai.exclude: true`; audit does not account for that intentional policy. Do not deindex them merely to silence it. |

Network audit against the local preview: **0 errors, 718 warnings, 1 info**.
The extra 129 warnings are lack of response compression on the local preview,
not proof that production lacks compression. The info finding concerns an
absent experimental DNS-AID record for the configured production domain; it
is not a prerequisite for Google indexing. External-link probing was not run.
Audit JSON was inspected and condensed here rather than retaining hundreds of
repeated findings in the docs folder. Both audits are reproducible above.

## Implications for Gemini and Remy Sport

Public rendered text, metadata, links and crawl access provide good technical
foundations for discovery. Markdown and MCP help an assistant retrieve precise
instructions after it finds or connects to the site. The mere presence of MCP,
skills and LLM files does not automatically connect ordinary Gemini users to
the product or guarantee a recommendation.

For Remy Sport, publish product/use-case pages and task guides in English and
Thai, with the same maintained content feeding HTML and agent outputs. Test
retrieval against real tasks such as registering a team or running live scoring.
This review did not adopt Blume, migrate Remy Sport or run a Gemini session.

Google says Search AI features use existing SEO requirements and do not need
special AI files: https://developers.google.com/search/docs/appearance/ai-features.
Googlebot controls Search crawling; Google-Extended controls specified Gemini
training/grounding uses, not Search ranking:
https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers#google-extended.

## Alternatives follow-up (2026-09-09)

This is a shortlist based on official documentation, not comparative runtime
testing. No migration or dependency upgrade was performed.

- **First retest newer Blume.** The [1.6.0 release notes](https://useblume.dev/changelog/blume-1-6-0)
  explicitly add automatic agent-resource/skill links in the LLM index,
  configurable product-use guidance and MCP resource listing/reading. This
  addresses the index-discovery gap found in 1.5.3 on paper; it does not prove
  the code-search or version-context issues are fixed. Keep the original
  runtime findings scoped to the tested version.
- **Mintlify:** a hosted candidate when reducing hosting/maintenance matters.
  Its [MCP documentation](https://www.mintlify.com/docs/ai/model-context-protocol)
  describes hosted search and full-page retrieval; users still connect their
  AI client. [Plans](https://www.mintlify.com/pricing) determine access to the
  assistant and automation features. Not demonstrated to outperform Blume
  in Gemini discovery or retrieval accuracy.
- **GitBook:** consider when an editorial platform and managed documentation
  workflow matter. It automatically publishes Markdown, LLM text files and
  [MCP access](https://gitbook.com/docs/publishing-documentation/llm-ready-docs).
- **Fumadocs:** consider for custom React integration. Its
  [LLM guide](https://www.fumadocs.dev/docs/integrations/llms) documents processed
  Markdown, text endpoints and configurable AI search. More custom application
  integration is a tradeoff, not automatically a better fit for the team's
  small automation surface.

Recommendation: keep Blume as the first self-hosted candidate and compare a
newer version against the recorded queries. Shortlist Mintlify if managed
hosting is preferred. There is no measured basis here to claim any framework
causes Gemini to recommend Remy Sport more often.

## Source references

- [Content configuration](https://github.com/middleapi/orpc/blob/4d9956975cad6600d9b91071d1dfc816017f9997/apps/content/blume.config.ts).
- [Browser code-search fix](https://github.com/middleapi/orpc/blob/4d9956975cad6600d9b91071d1dfc816017f9997/apps/content/search/code-index.ts).
- [Core oRPC skill](https://github.com/middleapi/orpc/blob/4d9956975cad6600d9b91071d1dfc816017f9997/skills/orpc/SKILL.md).
- [Blume AI documentation](https://useblume.dev/docs/configuration/ai).
  This is moving documentation; the installed source and tested version were
  1.5.3. Do not assume newer documented features exist in that version.

Production spot checks independently confirmed MCP initialization, the
`onSuccess` search gap, Markdown negotiation and discovery files. Production
robots allowed crawling and declared search/AI-input/AI-training allowed.

Remy Sport's documentation check also passed: `bun run test -- tests/repo/docs.test.ts`
(two tests). No Remy Sport application tests were needed for this review-only change.
