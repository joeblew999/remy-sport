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

## Project config

| Variable | Value |
|---|---|
| Worker name | `remy-sport` |
| Cloudflare subdomain | `gedw99` |
| Deployed URL | `https://remy-sport.gedw99.workers.dev` |
| Local URL | `http://localhost:8787` |
| D1 database | `remy-sport-db` |
| R2 bucket | `remy-sport-storage` |

Config lives in `wrangler.toml`. Secrets (e.g. `BETTER_AUTH_SECRET`) are set via `wrangler secret` — never stored in config. Local dev uses `.dev.vars`.

## Decision

### `versions.json` structure

Generated at dev time by `mise run versions`. Contains three sections:

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

The deployed URL is deterministic — built from `WORKER_NAME` + `CF_SUBDOMAIN` in `wrangler.toml`. No runtime discovery needed.

### Version display in UI

The home page footer shows:
1. Current version: `v0.1.0 · abc1234 · main` with a clickable link to the deployed URL
2. Expandable **Deploy history** — all previous app deployments
3. Expandable **CF versions** — all Cloudflare Worker versions with IDs, numbers, and sources

Everything is embedded in `versions.json` at build time — the UI just renders it.

## Mise tasks

All tasks are defined in `mise.toml`. The underlying commands use `bunx wrangler` and `bun`.

### Dev

| Task | Command | Description |
|---|---|---|
| `mise run dev` | `bunx wrangler dev` | Start local dev server (port 8787) |
| `mise run dev:remote` | `bunx wrangler dev --remote` | Dev server against remote CF resources |

### Setup & checks

| Task | Command | Description |
|---|---|---|
| `mise run setup` | install + migrate | Install deps and apply local D1 migrations |
| `mise run install` | `bun install` | Install dependencies (idempotent via bun.lock) |
| `mise run check` | `bunx tsc --noEmit` | TypeScript type check |

### Testing

| Task | Command | Description |
|---|---|---|
| `mise run test` | `bunx playwright test` | Run Playwright tests locally |
| `mise run test:deployed` | `bunx playwright test` (BASE_URL=deployed) | Run Playwright tests against deployed worker |
| `mise run test:ui` | `bunx playwright test --ui` | Run Playwright tests with interactive UI |

### Seeding

| Task | Command | Description |
|---|---|---|
| `mise run seed` | `curl POST /api/seed` (local) | Seed local D1 with dev users |
| `mise run seed:remote` | `curl POST /api/seed` (deployed) | Seed remote D1 with dev users |

### Deploy pipeline

`mise run deploy` runs the full pipeline in order — stops on any failure:

```
setup → check → test → versions → cf:deploy → cf:d1:migrations:apply:remote → seed:remote → test:deployed
```

| Task | Description |
|---|---|
| `mise run versions` | Generate `versions.json` (git history + CF versions) |
| `mise run deploy` | Full deploy pipeline |

### Cloudflare Workers versioning

| Task | Description |
|---|---|
| `mise run cf:deploy` | Deploy worker (default — idempotent via source checksum) |
| `mise run cf:deploy:staging` | Deploy to staging environment |
| `mise run cf:deploy:production` | Deploy to production environment |
| `mise run cf:versions:list` | List all deployed versions |
| `mise run cf:versions:upload` | Upload a new version without deploying |
| `mise run cf:versions:deploy` | Gradual rollout — split traffic between versions |
| `mise run cf:rollback` | Roll back to the previous version |

### D1 database

| Task | Description |
|---|---|
| `mise run cf:d1:migrations:apply` | Apply migrations locally (idempotent) |
| `mise run cf:d1:migrations:apply:remote` | Apply migrations to remote D1 (idempotent) |
| `mise run cf:d1:migrations:create` | Create a new migration file |
| `mise run cf:d1:tables` | List tables in local D1 |
| `mise run cf:d1:tables:remote` | List tables in remote D1 |
| `mise run cf:d1:execute` | Execute SQL against local D1 |
| `mise run cf:d1:execute:remote` | Execute SQL against remote D1 |

### R2 storage

| Task | Description |
|---|---|
| `mise run cf:r2:list` | List R2 buckets |
| `mise run cf:r2:create` | Create the project R2 bucket |
| `mise run cf:r2:objects` | List objects in the R2 bucket |

### Debugging

| Task | Description |
|---|---|
| `mise run cf:tail` | Tail live worker logs |
| `mise run cf:whoami` | Show current Cloudflare auth info |
| `mise run cf:secret:list` | List secrets set on the worker |

## Files

```
mise.toml                  — all task definitions
wrangler.toml              — worker name, D1, R2, env vars
.dev.vars                  — local secrets (not committed)
versions.json              — generated build artifact (committed, bundled)
scripts/versions.ts        — versions.json generation script
src/routes/home.ts         — /api/versions endpoint + version display in UI
playwright.config.ts       — BASE_URL env var support for test:deployed
```

### Version metadata binding (future)

When runtime access to the CF version ID is needed (e.g. for logging), add to `wrangler.toml`:

```toml
[version_metadata]
binding = "CF_VERSION"
```

This gives `env.CF_VERSION.id` and `env.CF_VERSION.tag` in the worker.

## Consequences

- Every deploy is automatically tested end-to-end before and after
- Full version history is visible in the UI — both app deploys and CF versions
- All URLs are deterministic at dev time — no runtime discovery needed
- Rollback is one command: `mise run cf:rollback`
- Gradual rollouts available via `mise run cf:versions:deploy`
- DB migrations are separate from code versions — must be backwards-compatible since rollback doesn't revert migrations
