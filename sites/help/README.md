# Remy Sport help

Run commands **from the repository root** with its pinned Bun and Node toolchain.
Preparation, frozen installs and server startup are automatic.

```sh
bun run ops docs dev
```

Open **http://127.0.0.1:8791/** and choose English, Thai or Japanese.
Keep the terminal running. Editing public MDX or CSS updates the GUI through
Fumapress’s Vite server. The app can keep running on its own port.

For visual authoring, use this single command instead:

```sh
bun run ops docs author
```

It starts **Fuma Studio at http://127.0.0.1:8793/** alongside live help and MCP.
Studio edits only public help Markdown. It uses Fuma’s own CLI, autosave, file
browser and collaboration features. Saving changes local files; it never deploys
or commits. Use the MDX tab for unsupported custom components, which are preserved
when left untouched. Creating/renaming files is currently a filesystem operation;
Studio browses and edits existing files.

**Ctrl-C** stops the command’s children. `bun run ops docs stop` also recovers
these servers after a terminal closes. Starting another docs command stops our
previous development/authoring servers automatically. It never kills a different
application merely because that application uses the same port.

## Local addresses

| Address | Purpose |
| --- | --- |
| http://127.0.0.1:8791/en | English help |
| http://127.0.0.1:8791/th | Thai help, translation drafts |
| http://127.0.0.1:8791/ja | Japanese help, translation drafts |
| http://127.0.0.1:8791/en/start-here | Spectator, player and organiser starting points |
| http://127.0.0.1:8791/en/troubleshooting | Interactive troubleshooting and its text equivalent |
| http://127.0.0.1:8791/en/sign-in.md | Individual Markdown guide; English home is `/en.md` |
| http://127.0.0.1:8791/llms.txt | All-language guide index |
| http://127.0.0.1:8791/llms-full.txt | Complete guide text |
| http://127.0.0.1:8791/en/updates | News archive and tagged release notes |
| http://127.0.0.1:8791/rss.xml | Documentation update feed |
| http://127.0.0.1:8791/en/api-reference/listGuides | Generated API reference with working request playground |
| http://127.0.0.1:8791/openapi.json | Public help retrieval schema |
| http://127.0.0.1:8791/help-index.json | Machine-readable guide catalogue |
| http://127.0.0.1:8792/mcp | Read-only MCP, Streamable HTTP |
| http://127.0.0.1:8793/ | Visual editor, with `author` |

An MCP client on this machine can connect to the URL above while `dev` or
`author` runs. Available tools: `search_docs` (query, locale, optional limit),
`read_guide` (catalogue path). Resources include the catalogue and each guide.
The companion also provides six public event/team/game read tools against the
local app at 8787, checking its generated API contract before each call.
There are no write tools, private account data or model-provider calls. Remote hosted
assistants cannot reach a localhost service. MCP is a companion service, not a
route in the static Cloudflare deployment.

## Verification and maintenance

```sh
bun run ops docs check
bun run ops docs preview
bun run ops docs clean
```

`check` builds the site, packages it with a dry run, audits all pages over local
Cloudflare emulation, checks MCP with the official SDK client, and tests editor
round trips, conflicts, two-peer collaboration, persisted restart and boundaries.
It stops its temporary servers when finished. `preview` does the same checks and
keeps the production preview running at 8791 with MCP at 8792; it has no hot reload.
Stop a running production preview before another build or cleanup.

`clean` removes generated output and dependencies from the three help packages.
It preserves public content and vendored font assets. After intentional package
manifest edits, `bun run ops docs lock` updates only their independent lockfiles.
Normal commands always use frozen lockfiles.

Thai/Japanese social-image fonts are licensed, vendored subsets. The CLI checks
needed title/description characters before starting/building. If that character
set changes, it downloads a new subset and licence through the recorded font
script. Unchanged content uses the committed assets offline. Include font asset
changes when committing new titles. Readers never fetch these fonts from Google.

## Collaboration and isolation

Studio’s `?collab` option enables collaborative editing for a tab; ordinary
editing is the default. Saved collaborative edits survive server restart in our
checks. Upstream still documents loss of **unsent edits made while the server is
down** when it restarts. Wait for a saved/synced state before restarting; this is
local authoring, not a production multi-user CMS. Uploads are disabled and the
server rejects cross-origin requests, hidden paths and symlink escapes.

The three packages have separate manifests, lockfiles and installations. The
public site imports no editor or MCP service. Nothing is added to the main app’s
source, asset bundle or Vite/Worker configuration. Shared commands check app and
dependency fingerprints before/after without resetting other work.

The site remains **noindex**, with `https://help.remy.invalid` as the reserved
canonical origin. Thai/Japanese translations await human review. Local SEO and
LLM checks verify output; they do not prove Google indexing or Gemini discovery.

[Plan and verification record](../../docs/2026-09-09-04-blume-public-help.md) ·
[Upstream bugs and fixes](../../docs/2026-09-09-05-fumapress-source-review.md)
