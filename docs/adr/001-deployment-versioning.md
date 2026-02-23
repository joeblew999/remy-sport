# ADR 001: Deployment Versioning

**Status:** Accepted

## Context

We deploy to Cloudflare Workers and need a reliable way to:
- Track what code is running in production
- See the full history of all deployed versions
- Roll back to a previous version if something breaks
- Gradually shift traffic to new versions to reduce risk
- Surface all version info in the UI with clickable links

Cloudflare Workers supports three concepts: **Worker** (the app), **Version** (immutable snapshot of code + config), and **Deployment** (which version(s) serve traffic). Up to 100 recent versions are available for rollback.

## Decision

### `versions.json` structure

Generated at **dev time** by `task versions`. Contains three sections:

```json
{
  "current": {
    "_generated": "2026-02-23T02:00:00Z",
    "app": "0.1.0",
    "url": "https://remy-sport.gedw99.workers.dev",
    "git": { "commit": "abc1234", "branch": "main", "tag": "v0.1.0" }
  },
  "history": [
    { "app": "0.1.0", "git": { "commit": "def5678", "branch": "main", "tag": "..." }, "url": "..." }
  ],
  "cf_versions": [
    { "id": "uuid", "number": 5, "created": "...", "source": "upload" }
  ]
}
```

- **`current`** — the version being deployed (git info + deployed URL)
- **`history`** — previous app versions (last 20, appended automatically, deduped by commit)
- **`cf_versions`** — Cloudflare Worker versions fetched from `wrangler versions list --json`

Key insight: the deployed URL is **deterministic** — built from `WORKER_NAME` + `CF_SUBDOMAIN` Taskfile vars at dev time. No runtime discovery needed.

### Version display in UI

The home page footer shows:
1. Current version: `v0.1.0 · abc1234 · main` with a clickable link to the deployed URL
2. Expandable **Deploy history** — all previous app deployments
3. Expandable **CF versions** — all Cloudflare Worker versions with IDs, numbers, and sources

Everything is embedded in `versions.json` at build time — the UI just renders it.

### Cloudflare Workers versioning

Use the built-in Workers Versions & Deployments system:

| Command | Purpose |
|---|---|
| `task cf:deploy` | Upload new version and deploy immediately (default) |
| `task cf:versions:upload` | Upload a version without deploying |
| `task cf:versions:deploy` | Gradual rollout — split traffic between versions |
| `task cf:versions:list` | List deployed versions |
| `task cf:rollback` | Roll back to a previous version |

### Deploy pipeline (`task deploy`)

The full deploy pipeline runs these steps in order:

1. `setup` — install deps, apply local migrations
2. `check` — TypeScript type check
3. `test` — Playwright tests locally
4. `versions` — generate versions.json (git history + CF versions)
5. `cf:deploy` — deploy to Cloudflare
6. `cf:d1:migrations:apply:remote` — apply remote DB migrations
7. `test:deployed` — Playwright tests against the live worker

If any step fails, the pipeline stops. This ensures we never deploy broken code.

## Implementation

### Files involved

- `Taskfile.yml` — `deploy`, `versions`, `test:deployed` tasks
- `taskfiles/Taskfile.cloudflare.yml` — `deploy`, `versions:*`, `rollback` tasks
- `versions.json` — generated build artifact (checked in so it's bundled)
- `src/routes/home.ts` — `/api/versions` endpoint and version display in UI
- `playwright.config.ts` — `BASE_URL` env var support for testing deployed worker

### Version metadata binding (future)

When we need runtime access to the CF version ID (e.g., for logging or headers), add the version metadata binding to `wrangler.toml`:

```toml
[version_metadata]
binding = "CF_VERSION"
```

This gives access to `env.CF_VERSION.id` and `env.CF_VERSION.tag` in the worker.

## Consequences

- Every deploy is automatically tested end-to-end before and after
- Full version history is visible in the UI — both app deploys and CF versions
- All URLs are built at dev time — no runtime discovery complexity
- Rollback is one command (`task cf:rollback`)
- Gradual rollouts are available when we need them for higher-risk changes
- DB migrations are separate from code versions — they must be backwards-compatible since rollback doesn't revert migrations
