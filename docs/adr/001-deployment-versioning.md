# ADR 001: Deployment Versioning

**Status:** Accepted

## Context

We deploy to Cloudflare Workers and need a reliable way to:
- Track what code is running in production
- Roll back to a previous version if something breaks
- Gradually shift traffic to new versions to reduce risk
- Surface the running version in the UI for debugging

Cloudflare Workers supports three concepts: **Worker** (the app), **Version** (immutable snapshot of code + config), and **Deployment** (which version(s) serve traffic). Up to 100 recent versions are available for rollback.

## Decision

### App-level versioning (`versions.json`)

Generate `versions.json` at **dev time** (before deploy) with:
- `app` — semver from `package.json`
- `git.commit` — short SHA
- `git.branch` — current branch
- `git.tag` — git tag or commit fallback
- `_generated` — UTC timestamp
- `url` — the deployed worker URL (built from `WORKER_NAME` + `CF_SUBDOMAIN` Taskfile vars)

This file is bundled into the worker and served at `/api/versions`. The home page displays it in the footer with a clickable link to the deployed version.

Key insight: the deployed URL is **deterministic** — it's built from the worker name and CF account subdomain, both known at dev time. No runtime discovery needed.

The `task versions` task is idempotent — it only regenerates when `package.json` or git HEAD changes.

### Version display in UI

The home page footer shows all version info with a link to the deployed instance:

```
v0.1.0 · abc1234 · main
https://remy-sport.gedw99.workers.dev
```

The link is embedded in `versions.json` at build time, so the UI just renders it — no URL construction at runtime.

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
4. `versions` — generate versions.json
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
- The running version is always visible in the UI
- Rollback is one command (`task cf:rollback`)
- Gradual rollouts are available when we need them for higher-risk changes
- DB migrations are separate from code versions — they must be backwards-compatible since rollback doesn't revert migrations
