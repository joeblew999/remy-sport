# remy-sport

Sports platform for basketball, built on Cloudflare Workers.

## URLs

- **Local:** http://localhost:8787
- **Production:** https://remy-sport.gedw99.workers.dev
- **Repo:** https://github.com/joeblew999/remy-sport

## Prerequisites

- [bun](https://bun.sh)
- [task](https://taskfile.dev)
- [Cloudflare account](https://dash.cloudflare.com) (for deploy)

## Development

```sh
task setup   # install deps + apply local D1 migrations
task dev     # start local dev server at :8787
task check   # type check
task test    # run playwright tests
task test:ui # run playwright tests with UI
```

## Deploy

```sh
task deploy  # full pipeline: setup, check, test, versions, deploy, remote migrate, test:deployed
```

## Cloudflare Resources

```sh
task cf:d1:tables         # list local D1 tables
task cf:d1:tables:remote  # list remote D1 tables
task cf:secret:list       # list worker secrets
task cf:tail              # tail live worker logs
```

See `task --list` for all available tasks.

## Design

Hi-fi prototype and design system spec from the design handoff:

- [docs/design/README.md](docs/design/README.md) — design tokens (colors, type, spacing), fidelity notes, recreation guidance
- [docs/design/prototype/](docs/design/prototype/) — clickable React prototype (CDN/Babel; reference only, not production code)

### Round-tripping with Claude Design

These files are authored in **[Claude Design](https://claude.ai/design/p/019dd7a8-708f-7bcf-a952-77b03ae9db3e)** — project ID `019dd7a8-708f-7bcf-a952-77b03ae9db3e`. Open Claude Design, edit, re-export, and replace the files at the paths below.

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

The same Claude Design project also contains the **pitch deck** under `biz/` — that lives in the biz repo at `remy-sport-biz/pitchdeck/`. See that repo's README for its mapping.
