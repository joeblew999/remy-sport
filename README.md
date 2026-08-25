# remy-sport

Sports platform for basketball, built on Cloudflare Workers (backend API) and a React + Vite + TypeScript web app that ships to Cloudflare Pages and — per [decision-003](https://github.com/joeblew999/remy-sport-biz/blob/main/decisions/decision-003-frontend-targets.md) — Tauri Desktop and Tauri Mobile from the same source.

## URLs

- **Web app (production):** https://remy-sport-design.pages.dev — public, hash-routed; share with pilot schools, coaches, parents.
- **Worker (production):** https://remy-sport.gedw99.workers.dev
- **Worker (local):** http://localhost:8787
- **Web app (local dev):** http://localhost:5175 (`mise run web:dev`)
- **Repo:** https://github.com/joeblew999/remy-sport

## Companion repo: business docs

The Product Owner's source-of-truth for *what* to build (and *why*) lives in **[remy-sport-biz](https://github.com/joeblew999/remy-sport-biz)**, a sibling repo. Engineers should treat that repo as authoritative for product decisions, domain definitions, and acceptance criteria. Concretely, when working on a feature here, look in biz for:

| Looking for | Path in `remy-sport-biz` |
|---|---|
| Who are the users? | [`domain/actors.md`](https://github.com/joeblew999/remy-sport-biz/blob/main/domain/actors.md) — six actors and their goals |
| What event shapes does the platform support? | [`domain/event-types.md`](https://github.com/joeblew999/remy-sport-biz/blob/main/domain/event-types.md) — Tournament / League / Camp / Showcase |
| Who can do what? | [`data/access/matrix.md`](https://github.com/joeblew999/remy-sport-biz/blob/main/data/access/matrix.md) — capability matrix, generated from `data/seed/` |
| What are we building, in what order? | [`roadmap/roadmap.md`](https://github.com/joeblew999/remy-sport-biz/blob/main/roadmap/roadmap.md) — Now / Next / Later |
| Epics and user stories | [`backlog/epics/`](https://github.com/joeblew999/remy-sport-biz/tree/main/backlog/epics/), [`backlog/stories/`](https://github.com/joeblew999/remy-sport-biz/tree/main/backlog/stories/) — acceptance criteria live in the stories |
| Why a thing is the way it is | [`decisions/`](https://github.com/joeblew999/remy-sport-biz/tree/main/decisions/) — ADRs (Better Auth, Zanzibar, frontend targets) |
| Realistic test data | [`data/seed/`](https://github.com/joeblew999/remy-sport-biz/tree/main/data/seed/) — JSONL fixtures the dev team loads into local D1, grouped by kind (`reference/`, `entities/`, `relationships/`, `authorization/`, `localization/`) |
| Pitch deck (stakeholder-facing) | [`pitchdeck/`](https://github.com/joeblew999/remy-sport-biz/tree/main/pitchdeck/) — also rendered to `remy-sport-pitchdeck.pdf` |

If you're a contributor and biz says X but the code says Y, **biz wins** unless there's an ADR documenting the divergence. Open a PR against biz first if you think a domain rule needs updating.

## Companion repo (local checkout)

`remy-sport-biz` is private, so getting it locally needs a token:

```sh
mise run biz:sync
```

Clones it to `../remy-sport-biz` on first run and fast-forwards it after that. The path is fixed rather than configurable — [scripts/domain-generate.ts](scripts/domain-generate.ts) resolves `../remy-sport-biz/data/seed`, and AGENTS.md documents the same location.

**This checkout is read-only and local-dev-only. Nothing in CI or deploy touches it.** `src/domain/vocabularies.ts` is generated from the biz fixtures but committed, so ordinary builds never clone anything — only regenerating it needs the checkout. If `biz:sync` fails, no build breaks.

### Regenerating the controlled vocabularies

Age groups, genders, org types, event types/formats and provinces come from the `remy-sport-biz` fixtures. The generator finds each file by name wherever it sits under `data/seed/`, so a regrouping upstream does not break it. When those fixtures change:

```sh
mise run biz:sync         # pull the latest fixtures
mise run domain:generate  # rewrite src/domain/vocabularies.ts and migration 0009
mise run domain:check     # fails if the committed files are stale
mise run cf:d1:reset      # replay migrations — wrangler will not re-run 0009 otherwise
```

**Display names are rows, not columns.** Each vocabulary table keeps `name_en`
as its pivot; every language including English is a row in `translation`, and
`/api/reference` returns a locale-keyed `names` map. Shipping a third language
is fixtures upstream plus a regeneration — never an `ALTER TABLE`, a new type
field, or an edit to a consumer. `tests/reference.spec.ts` fails if a
per-language field reappears on a vocabulary row.

Same shape as `auth:schema:generate` / `auth:schema:check`, for the same reason — a file generated from a source of truth, committed, with a check mode that catches drift. See [ADR 015](docs/dev/adr/015-reference-vocabularies.md).

`domain:check` is **not** part of `mise run check` or the deploy pipeline, deliberately: wiring it in would make every build depend on a private repo and a token. Run it after syncing biz, or before committing a vocabulary change. It exits `1` when stale and `2` when the checkout is missing.

### One-time token setup

Do this once per machine; `biz:sync` only reads the token, it never creates one.

1. Mint a **fine-grained** PAT at [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new):
   - Resource owner `joeblew999`, repository access limited to **`remy-sport-biz` only**
   - Permissions: **Contents: Read-only** — nothing else
   - Short expiry; this is a convenience credential, not infrastructure
2. Store it in the OS keychain via fnox:

```sh
mise exec -- fnox set --global -p keychain GITHUB_BIZ_REPO_TOKEN
```

It prompts with hidden input, so the token never reaches argv, `ps`, or shell history. Re-run the same command to replace an expired one.

`mise exec --` is not optional. fnox is pinned in this repo's `[tools]`; a bare `fnox` picks up whatever install happens to be on your `PATH`, which is a different binary (compare `mise which fnox` against `which fnox`).

For scripting a rotation non-interactively, fnox also reads a piped value — but that form puts the token in your shell history, so prefer the prompt:

```sh
printf %s "$NEW_TOKEN" | mise exec -- fnox set --global -p keychain GITHUB_BIZ_REPO_TOKEN
```

[fnox.toml](fnox.toml) declares the secrets this repo consumes — names only, no values, safe to commit. It merges with your global fnox config rather than replacing it. To see what's present on this machine without printing anything:

```sh
mise exec -- fnox check --all
```

**The token is never written to disk.** `biz:sync` passes it to git through `GIT_ASKPASS` for the duration of a single command; the remote URL stored in `.git/config` is the plain `https://github.com/joeblew999/remy-sport-biz.git`, with no credential embedded. Any credential helper the machine has configured is disabled for those calls (`-c credential.helper=`) so nothing gets cached behind your back, and the task greps `.git/config` afterwards and fails if the token ever turns up there.

## Prerequisites

This repo uses [**mise**](https://mise.jdx.dev) to manage tools (bun, node, jq, fnox) and tasks. Install it once:

```sh
curl https://mise.run | sh        # macOS / Linux
```

Then in this folder, mise installs the right tool versions automatically the first time you run a task.

- [Cloudflare account](https://dash.cloudflare.com) (for deploy)

## Repo layout

| Path | What |
|---|---|
| [src/index.ts](src/index.ts) and [src/](src/) | Cloudflare Worker — the backend API (Hono + Drizzle + Better Auth) |
| [src/web/](src/web/) | The React + Vite + TypeScript web app (frontend) |
| [src/db/](src/db/) | D1 schema + migrations |
| [src/auth/](src/auth/) | Better Auth integration |
| [tests/](tests/) | Playwright tests |
| `dist/web/` | Production build output of the web app (gitignored) |

The same `src/web/` bundle is also the source for **Tauri Desktop** (macOS/Windows/Linux) and **Tauri Mobile** (iOS/Android) per [ADR 003](https://github.com/joeblew999/remy-sport-biz/blob/main/decisions/decision-003-frontend-targets.md). Tauri scaffolding is not yet in the repo — it's added when production mobile/desktop builds are needed.

## Worker development

```sh
mise run setup   # install deps + apply local D1 migrations + Playwright
mise run dev     # start local worker dev server at :8787
mise run check   # type check
mise run test    # run playwright tests
mise run test:ui # run playwright tests with UI
```

## Web app development

```sh
mise run web:dev        # vite dev with HMR at :5175
mise run web:typecheck  # strict TS check across src/web/
mise run web:build      # production build → dist/web/
mise run web:deploy     # build + ship to Cloudflare Pages
```

## Worker deploy

```sh
mise run deploy   # full pipeline: setup, check, test, versions, deploy, remote migrate, test:deployed
```

## Cloudflare Resources

```sh
mise run cf:d1:tables         # list local D1 tables
mise run cf:d1:tables:remote  # list remote D1 tables
mise run cf:secret:list       # list worker secrets
mise run cf:tail              # tail live worker logs
```

See `mise tasks` for all available tasks.

## Architecture notes

- **Hash routing** in the web app (`#/event/e1` etc.) — required for Tauri webview compatibility, and gives shareable deep-links on web.
- **Mobile-responsive** — sidebar collapses to off-canvas drawer ≤768px, tables reflow, touch targets ≥40px on coarse pointers.
- **Mock data layer** in `src/web/lib/data.tsx` reads from `src/web/data.ts` synchronously today; production swap to react-query + Workers API is a one-file change with no call-site impact.
- **No Node APIs in the web app.** Code under `src/web/` runs in a browser / Tauri webview — `process`, `fs`, `path`, etc. are off-limits. Use feature detection for browser APIs that may not exist on iOS WKWebView. See [ADR 003](https://github.com/joeblew999/remy-sport-biz/blob/main/decisions/decision-003-frontend-targets.md) for the full set of platform constraints.
