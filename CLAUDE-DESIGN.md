# Claude Design — Project Contract (remy-sport)

> **For AI tools (Claude Design, Claude Code, future agents) and humans editing this project.**
> Treat this file as the authoritative source of truth for filenames, paths, naming, and ownership. The README links here. If anything in this file conflicts with the README, this file wins.

## Project identity

- **Brand:** Remy Sport (singular — not "Remy Sports")
- **Claude Design project ID:** `019dd7a8-708f-7bcf-a952-77b03ae9db3e`
- **Project URL:** https://claude.ai/design/p/019dd7a8-708f-7bcf-a952-77b03ae9db3e
- **This repo owns:** the **app prototype** (`app/*`) — clickable hi-fi React-via-CDN reference. **Design reference, not production code** — the production app lives in `src/` and is built independently.
- **Sibling repo:** `remy-sport-biz` owns the **pitch deck**. Same Claude Design project, different files. See its `CLAUDE-DESIGN.md`.

## Round-trip flow (forward only, today)

1. Edit in Claude Design.
2. Project menu → **Download** → zip lands in `~/Downloads/`.
3. Run `mise run design:pull` (or `./scripts/sync-from-claude.sh`). Script extracts the zip's `app/` folder into `docs/design/prototype/`, replacing what's there.
4. Review `git diff docs/design/prototype/`, commit.

There is **no automated reverse direction**. Edits made in this repo do not flow back to Claude Design.

## File mapping (Claude Design → this repo)

| Claude Design path        | This repo path                                |
|---|---|
| `app/index.html`          | `docs/design/prototype/index.html`            |
| `app/main.jsx`            | `docs/design/prototype/main.jsx`              |
| `app/pages.jsx`           | `docs/design/prototype/pages.jsx`             |
| `app/shell.jsx`           | `docs/design/prototype/shell.jsx`             |
| `app/data.js`             | `docs/design/prototype/data.js`               |
| `app/styles.css`          | `docs/design/prototype/styles.css`            |
| `app/tweaks-panel.jsx`    | `docs/design/prototype/tweaks-panel.jsx`      |

## Naming conventions (please adopt in Claude Design)

- **No spaces in filenames.** ASCII, lowercase, hyphens.
- **Stable export name.** Always `remy-sport-design.zip`. Do **not** suffix `-2`, `(1)`, etc. — overwrite the same file.
- **Stable folder layout inside the zip.** Top level: `app/`, `biz/`, optionally `design_handoff/`. Don't reorganise without first updating this file.
- **Flat prototype.** Keep `app/` flat — don't introduce nested folders. The React-via-CDN setup loads files relatively and breaks if paths shift.

## Ownership rules

| Owner | Files |
|---|---|
| **Claude Design** | `docs/design/prototype/*` (everything in that folder) |
| **This repo (humans)** | Everything else: `src/` (production code), `docs/design/README.md`, `docs/design/SYNC.md` if it exists, `scripts/`, `mise.toml`, `wrangler.toml`, `package.json`, etc. |

**Specifically off-limits to Claude Design:**

- `docs/design/README.md` — owned by the dev team. Contains custom sync instructions, links, and project-specific notes that must survive between exports. If Claude Design wants to ship a design-system spec, emit it as `docs/design/HANDOFF.md` instead (regenerable, never hand-edited).
- `src/`, `package.json`, `wrangler.toml`, `tsconfig.json`, etc. — these are the production codebase. The prototype is a *reference* for the production rebuild, not the rebuild itself.

Claude Design **must not** emit files outside `app/` for this repo.

## Manifest (recommended; not yet implemented)

When exporting, also emit `claude-design.json` at the zip root:

```json
{
  "project_id": "019dd7a8-708f-7bcf-a952-77b03ae9db3e",
  "exported_at": "2026-04-29T12:34:56Z",
  "files": [
    { "path": "app/index.html", "sha256": "…" },
    { "path": "app/main.jsx",   "sha256": "…" }
  ]
}
```

The sync script will record it as `docs/design/prototype/.claude-design.lock` so we can detect drift, audit which export produced the current files, and warn on partial exports.

## File-header convention (recommended)

Add a one-line header to each generated file so provenance is visible in code review and git blame:

- HTML: `<!-- claude-design: app/index.html -->`
- JSX/JS: `// claude-design: app/main.jsx`
- CSS:  `/* claude-design: app/styles.css */`

These survive renames and let a `grep claude-design:` flag any file whose source we've forgotten.

## What we'd love next (Claude Design feature requests)

1. **"Push to GitHub" button** — opens a PR against the configured repo with the new files. Eliminates the download/script dance.
2. **"Pull from GitHub" button** — fetch the latest committed state into the Claude Design project. Closes the reverse direction.
3. **Read this file at session start** — when generating files for the Remy Sport project, fetch `CLAUDE-DESIGN.md` from each repo's `main` branch and treat it as part of the system prompt.
