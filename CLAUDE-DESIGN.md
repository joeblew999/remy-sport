# Claude Design — Project Contract (remy-sport)

> **Contract version: 2026-04-29 r4.** When loading this file, echo this line back so we can confirm we're aligned.
>
> **For AI tools (Claude Design, Claude Code, future agents) and humans editing this project.**
> Treat this file as the authoritative source of truth for filenames, paths, naming, and ownership. The README links here. If anything in this file conflicts with the README, this file wins.

## Project identity

- **Brand:** Remy Sport (singular — not "Remy Sports")
- **Claude Design project ID:** `019dd7a8-708f-7bcf-a952-77b03ae9db3e`
- **Project URL:** https://claude.ai/design/p/019dd7a8-708f-7bcf-a952-77b03ae9db3e
- **This repo owns:** the **app prototype** (`app/*`) — clickable hi-fi React-via-CDN reference. **Design reference, not production code** — the production app lives in `src/` and is built independently.
- **Sibling repo:** `remy-sport-biz` owns the **pitch deck**. Same Claude Design project, different files. See its `CLAUDE-DESIGN.md`.

## How the round-trip actually works

| Direction | Mechanism | Notes |
|---|---|---|
| **Repo → Claude Design** | Claude Design reads files via its `github_*` tools, on demand, against the `ref` requested. | No caching. Every read hits GitHub fresh. Bootstrapped via a line in this project's CLAUDE.md telling Claude Design to fetch `CLAUDE-DESIGN.md` from `main` at the start of every task. Mid-session edits in the repo are picked up only when Claude Design is asked to re-read (or starts a new task that triggers the bootstrap). |
| **Claude Design → Repo** | Manual: Project menu → **Download** → zip → `mise run design:pull`. | No push API today. The script extracts the zip's `app/` folder into `docs/design/prototype/`. Review with `git diff docs/design/prototype/` and commit. |

So the loop is: edits made in Claude Design require a manual zip-and-sync to land in the repo; edits made in the repo are visible to Claude Design as soon as it's asked to read again (which the CLAUDE.md bootstrap arranges to happen on every task).

## File mapping (Claude Design → this repo)

| Claude Design path        | This repo path                                |
|---|---|
| `app/index.html`            | `docs/design/prototype/index.html`              |
| `app/main.jsx`              | `docs/design/prototype/main.jsx`                |
| `app/data.js`               | `docs/design/prototype/data.js`                 |
| `app/styles.css`            | `docs/design/prototype/styles.css`              |
| `app/tweaks-panel.jsx`      | `docs/design/prototype/tweaks-panel.jsx`        |
| `app/lib/data.jsx`          | `docs/design/prototype/lib/data.jsx`            |
| `app/lib/router.jsx`        | `docs/design/prototype/lib/router.jsx`          |
| `app/lib/i18n.jsx`          | `docs/design/prototype/lib/i18n.jsx`            |
| `app/components/icon.jsx`   | `docs/design/prototype/components/icon.jsx`     |
| `app/components/crest.jsx`  | `docs/design/prototype/components/crest.jsx`    |
| `app/components/sidebar.jsx`| `docs/design/prototype/components/sidebar.jsx`  |
| `app/components/topbar.jsx` | `docs/design/prototype/components/topbar.jsx`   |
| `app/pages/discover.jsx`    | `docs/design/prototype/pages/discover.jsx`      |
| `app/pages/event.jsx`       | `docs/design/prototype/pages/event.jsx`         |
| `app/pages/bracket.jsx`     | `docs/design/prototype/pages/bracket.jsx`       |
| `app/pages/live.jsx`        | `docs/design/prototype/pages/live.jsx`          |
| `app/pages/team.jsx`        | `docs/design/prototype/pages/team.jsx`          |
| `app/pages/profile.jsx`     | `docs/design/prototype/pages/profile.jsx`       |

**Refactor notes (2026-04-29):**
- **Round 1:** `app/pages.jsx` (38 KB single file) split into per-page files under `app/pages/`. The single-file version no longer exists.
- **Round 2:** `app/shell.jsx` split into per-component files under `app/components/`; new `app/lib/router.jsx` (hash-based router) and `app/lib/i18n.jsx` (i18n hook + helpers); JSDoc typedefs added to `data.js` and `lib/data.jsx`. The single-file `shell.jsx` no longer exists.

## Naming conventions (please adopt in Claude Design)

- **No spaces in filenames.** ASCII, lowercase, hyphens.
- **Stable export name.** Always `remy-sport-design.zip`. Do **not** suffix `-2`, `(1)`, etc. — overwrite the same file.
- **Stable folder layout inside the zip.** Top level: `app/`, `biz/`, optionally `design_handoff/`. Don't reorganise without first updating this file.
- **Sub-folders are now allowed under `app/`.** Specifically `app/pages/`, `app/lib/`, and `app/components/` exist. Any new sub-folder must be added to the file mapping table above before generating files into it.

## Platform constraints (Web + Tauri Mobile + Tauri Desktop)

The prototype targets **all three** in production per [decision-003](https://github.com/joeblew999/remy-sport-biz/blob/main/decisions/decision-003-frontend-targets.md): web (Cloudflare Pages), Tauri Desktop (macOS/Windows/Linux), and Tauri Mobile (iOS/Android) — same React bundle in all three. Generated code must stay platform-agnostic so it runs identically in a browser and inside a Tauri webview (WebKit / WebView2 / WebKitGTK).

Concretely, **don't generate code that depends on**:

- **Node APIs** — `process`, `fs`, `path`, `Buffer`, `__dirname`, `require()`. The webview is a browser, not Node. (Workers code in the dev repo's `src/` is allowed Node-style imports because it runs on Cloudflare Workers — that's a different target. The prototype is webview-only.)
- **Path-absolute asset URLs** that start with `/`. Tauri serves assets via `tauri://localhost/` and mobile filesystems break on absolute paths. Use **relative paths** like `<link href="styles.css">` not `<link href="/styles.css">`.
- **`@tauri-apps/api` calls outside a capability layer.** If a feature needs Tauri-only APIs (filesystem, native menus, push, deep links), wrap them in `app/lib/platform.jsx` (to be added when the production rebuild starts) that detects `isTauri()` and provides graceful web fallbacks. Don't import `@tauri-apps/api` directly from page or component files.
- **Browser-only APIs without fallbacks** — `localStorage` is fine (Tauri webview supports it), but `window.requestIdleCallback`, `window.requestPersistentNotificationPermission`, and similar fringe APIs may not exist on iOS WKWebView. Use feature detection.
- **Path-based routing.** Routing must stay hash-based (`#/event/e1`) — already enforced by `app/lib/router.jsx`. Path-based routes (`/event/e1`) require server rewrites that don't exist in Tauri webviews.

**Window chrome:** the current `tauri-chrome` div is CSS-mocked. Real Tauri provides the actual window on desktop and hides chrome entirely on mobile. Don't generate code that assumes the chrome is always present — the `showTauriChrome` toggle is what gates it today and will become platform-detected later.

**Mobile-responsive design is a separate, future concern** but worth noting now: the prototype's sidebar layout is desktop-shaped. Don't add new layouts that hard-code wide viewports without leaving room for a responsive collapse later.

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

## File-header convention (REQUIRED)

Every file generated for this repo must include a one-line header naming its **Claude Design path** (left column of the mapping table). Place it as the first line, or — for HTML — immediately after the doctype:

- HTML:   `<!-- claude-design: app/index.html -->`
- JSX/JS: `// claude-design: app/main.jsx`
- CSS:    `/* claude-design: app/styles.css */`

These headers survive renames, make provenance visible in `git blame`, and let `grep -r "claude-design:"` instantly flag any file whose source has been forgotten. Do not change the format — the prefix `claude-design:` followed by the path is what tooling will rely on.

## What we'd love next (Claude Design feature requests)

1. **"Push to GitHub" button** — opens a PR against the configured repo with the new files. Closes the only remaining manual step in the loop.
2. **Visible "pull latest from main" affordance** — today, refreshing the contract requires explicitly asking Claude Design to re-read. A button (or auto-refresh on `main` advance) would prevent stale rule-following mid-session.
