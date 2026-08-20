# ADR 002: Seed Users for Development and Testing

**Status:** Accepted

## Context

Developers and Playwright tests need predictable user accounts to work with. Previously, tests created throwaway users with random emails on every run, and developers had to manually register through the UI. This was slow and unreliable — tests couldn't verify role-based features, and devs wasted time on setup.

We need one well-known seed user per actor role, so tests can verify role-based access for every actor:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@remy.dev` | `admin1234!` |
| Organizer | `organizer@remy.dev` | `organizer1!` |
| Coach | `coach@remy.dev` | `coach12345!` |
| Player | `player@remy.dev` | `player1234!` |
| Spectator | `spectator@remy.dev` | `spectator1!` |
| Referee | `referee@remy.dev` | `referee1234!` |

These are **dev/test credentials only** — not for production.

> **Amended 2026-08-20.** This ADR originally specified two users (`admin@remy.dev` and `user@remy.dev`). It was superseded in practice by [ADR 005](005-api-and-authorization.md), which needs one account per actor role. [src/routes/seed.ts](../../../src/routes/seed.ts) creates the six above; `user@remy.dev` no longer exists. The table is corrected here to match the code.

## Decision

### 1. Seed endpoint

`POST /api/seed` endpoint (`src/routes/seed.ts`) that upserts the seed users via Better Auth's `signUpEmail` API. The endpoint is idempotent — it skips users that already exist. The worker itself handles seeding through its existing auth stack (no separate script runner needed).

### 2. Mise tasks

| Task | Description |
|---|---|
| `mise runseed` | Curl `POST /api/seed` on local dev server (requires `mise rundev` running) |
| `mise runseed:remote` | Curl `POST /api/seed` on deployed worker |

`seed:remote` is wired into the `deploy` pipeline after remote DB migrations, before deployed tests. For local dev, developers run `mise runseed` while `mise rundev` is running.

### 3. Login page quick-fill

The login page shows dev account buttons below the form:

```
── Dev accounts ──
[Admin] [Organizer] [Coach] [Player] [Spectator] [Referee]
```

Clicking fills the email/password fields and submits the form automatically.

### 4. Playwright test updates

Tests use the seed users instead of creating random accounts:
- First test calls `/api/seed` to ensure users exist
- Verifies all six actors can sign in with known credentials
- Tests the quick-fill buttons are visible on the login page

### 5. Better Auth Admin plugin (future)

Enable the Better Auth `admin` plugin to give the admin user elevated privileges. Deferred until admin-only routes are needed.

## Implementation

### Files created/modified

| File | Change |
|---|---|
| `src/routes/seed.ts` | NEW — `POST /api/seed` endpoint |
| `src/index.ts` | Register seed routes |
| `src/views/login.ts` | Dev account quick-fill buttons + `fillDev()` function |
| `mise.toml` | `seed` and `seed:remote` tasks; `seed:remote` in deploy pipeline |
| `tests/auth.spec.ts` | Use seed users, test seed endpoint |
| `tests/login.spec.ts` | Test quick-fill buttons visible |
| `CONTEXT.md` (now `AGENTS.md`) | Document seed user credentials, ADR mise tasks convention |

## Consequences

- Playwright tests are deterministic — no more random emails
- Login page shows quick-fill, reducing dev friction
- Seed credentials are well-known and documented — never use in production
- Admin plugin deferred until needed (avoids premature complexity)
- Deploy pipeline seeds remote DB automatically
