# remy-sport

Sports platform for basketball, built on Cloudflare Workers.

## URLs

- **Local:** http://localhost:8787
- **Production:** https://remy-sport.gedw99.workers.dev
- **Repo:** https://github.com/joeblew999/remy-sport

## Companion repo: business docs

The Product Owner's source-of-truth for *what* to build (and *why*) lives in **[remy-sport-biz](https://github.com/joeblew999/remy-sport-biz)**, a sibling repo. Engineers should treat that repo as authoritative for product decisions, domain definitions, and acceptance criteria. Concretely, when working on a feature here, look in biz for:

| Looking for | Path in `remy-sport-biz` |
|---|---|
| Who are the users? | [`domain/actors.md`](https://github.com/joeblew999/remy-sport-biz/blob/main/domain/actors.md) — six actors and their goals |
| What event shapes does the platform support? | [`domain/event-types.md`](https://github.com/joeblew999/remy-sport-biz/blob/main/domain/event-types.md) — Tournament / League / Camp / Showcase |
| Who can do what? | [`access/matrix.md`](https://github.com/joeblew999/remy-sport-biz/blob/main/access/matrix.md) — capability matrix, generated from `data/seed/` |
| What are we building, in what order? | [`roadmap/roadmap.md`](https://github.com/joeblew999/remy-sport-biz/blob/main/roadmap/roadmap.md) — Now / Next / Later |
| Epics and user stories | [`backlog/epics/`](https://github.com/joeblew999/remy-sport-biz/tree/main/backlog/epics/), [`backlog/stories/`](https://github.com/joeblew999/remy-sport-biz/tree/main/backlog/stories/) — acceptance criteria live in the stories |
| Why a thing is the way it is | [`decisions/`](https://github.com/joeblew999/remy-sport-biz/tree/main/decisions/) — ADRs (e.g. Better Auth, Zanzibar-style auth) |
| Realistic test data | [`data/seed/`](https://github.com/joeblew999/remy-sport-biz/tree/main/data/seed/) — CSVs the dev team loads into local D1 |
| Pitch deck (stakeholder-facing) | [`pitchdeck/`](https://github.com/joeblew999/remy-sport-biz/tree/main/pitchdeck/) — also rendered to `remy-sport-pitchdeck.pdf` |

If you're a contributor and biz says X but the code says Y, **biz wins** unless there's an ADR documenting the divergence. Open a PR against biz first if you think a domain rule needs updating.

## Prerequisites

This repo uses [**mise**](https://mise.jdx.dev) to manage tools (bun, node, jq) and tasks. Install it once:

```sh
curl https://mise.run | sh        # macOS / Linux
```

Then in this folder, mise installs the right tool versions automatically the first time you run a task.

- [Cloudflare account](https://dash.cloudflare.com) (for deploy)

## Development

```sh
mise run setup   # install deps + apply local D1 migrations + Playwright
mise run dev     # start local dev server at :8787
mise run check   # type check
mise run test    # run playwright tests
mise run test:ui # run playwright tests with UI
```

## Deploy

```sh
mise run deploy  # full pipeline: setup, check, test, versions, deploy, remote migrate, test:deployed
```

## Cloudflare Resources

```sh
mise run cf:d1:tables         # list local D1 tables
mise run cf:d1:tables:remote  # list remote D1 tables
mise run cf:secret:list       # list worker secrets
mise run cf:tail              # tail live worker logs
```

See `mise tasks` for all available tasks.

## Design

Hi-fi prototype and design system spec from the design handoff:

- [docs/design/README.md](docs/design/README.md) — design tokens (colors, type, spacing), fidelity notes, recreation guidance
- [docs/design/prototype/](docs/design/prototype/) — clickable React prototype (CDN/Babel; reference only, not production code)

### Local preview

```sh
mise run design:serve   # http://localhost:5174 — opens in browser
```

### Public preview (Cloudflare Pages)

To share the prototype with pilot schools, coaches, and stakeholders for feedback, deploy the static prototype to Cloudflare Pages:

```sh
mise run design:deploy   # ships docs/design/prototype/ to Cloudflare Pages
```

First run creates the `remy-sport-design` Pages project; subsequent runs are deploys. The public URL is reported at the end of `wrangler`'s output (typically `https://remy-sport-design.pages.dev`).

### Round-tripping with Claude Design

These files are authored in **[Claude Design](https://claude.ai/design/p/019dd7a8-708f-7bcf-a952-77b03ae9db3e)** — project ID `019dd7a8-708f-7bcf-a952-77b03ae9db3e`. Open Claude Design, edit, re-export, and replace the files at the paths below.

> **The full project contract — naming conventions, ownership rules, future requests — lives in [CLAUDE-DESIGN.md](CLAUDE-DESIGN.md).** Paste/link it into the Claude Design project knowledge so the rules travel with the project.

**File mapping (Claude Design → this repo):**

| Claude Design path | This repo path |
|---|---|
| `app/index.html` | [docs/design/prototype/index.html](docs/design/prototype/index.html) |
| `app/main.jsx` | [docs/design/prototype/main.jsx](docs/design/prototype/main.jsx) |
| `app/pages.jsx` | [docs/design/prototype/pages.jsx](docs/design/prototype/pages.jsx) |
| `app/shell.jsx` | [docs/design/prototype/shell.jsx](docs/design/prototype/shell.jsx) |
| `app/data.js` | [docs/design/prototype/data.js](docs/design/prototype/data.js) |
| `app/styles.css` | [docs/design/prototype/styles.css](docs/design/prototype/styles.css) |
| `app/tweaks-panel.jsx` | [docs/design/prototype/tweaks-panel.jsx](docs/design/prototype/tweaks-panel.jsx) |
| `design_handoff_remy_sport/README.md` | [docs/design/README.md](docs/design/README.md) |

Direct deep-links:
- App prototype entry: https://claude.ai/design/p/019dd7a8-708f-7bcf-a952-77b03ae9db3e?file=app%2Findex.html
- Project root: https://claude.ai/design/p/019dd7a8-708f-7bcf-a952-77b03ae9db3e

#### Syncing from Claude

After downloading the project zip from Claude (Project menu → Download in claude.ai), drop it in `~/Downloads/` and run:

```sh
mise run design:pull
# or directly:
./scripts/sync-from-claude.sh
./scripts/sync-from-claude.sh ~/Downloads/some-specific-export.zip
```

The script extracts the zip's `app/` folder into [docs/design/prototype/](docs/design/prototype/), replacing what's there. Review with `git diff docs/design/prototype` and commit.

The same Claude Design project also contains the **pitch deck** under `biz/` — that lives in the biz repo at `remy-sport-biz/pitchdeck/`. See that repo's README for its mapping (and matching sync script).
