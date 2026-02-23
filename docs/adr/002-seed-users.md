# ADR 002: Seed Users for Development and Testing

**Status:** Accepted

## Context

Developers and Playwright tests need predictable user accounts to work with. Previously, tests created throwaway users with random emails on every run, and developers had to manually register through the UI. This was slow and unreliable — tests couldn't verify role-based features, and devs wasted time on setup.

We need two well-known seed users:

| Role | Email | Password | Purpose |
|---|---|---|---|
| Admin | `admin@remy.dev` | `admin1234!` | Admin features, privileged actions |
| User | `user@remy.dev` | `user12345!` | Normal user flows, default testing |

These are **dev/test credentials only** — not for production.

## Decision

### 1. Seed endpoint

`POST /api/seed` endpoint (`src/routes/seed.ts`) that upserts the two users via Better Auth's `signUpEmail` API. The endpoint is idempotent — it skips users that already exist. The worker itself handles seeding through its existing auth stack (no separate script runner needed).

### 2. Taskfile integration

| Task | Description |
|---|---|
| `task seed` | Curl `POST /api/seed` on local dev server (requires `task dev` running) |
| `task seed:remote` | Curl `POST /api/seed` on deployed worker |

`seed:remote` is wired into the `deploy` pipeline after remote DB migrations, before deployed tests. For local dev, developers run `task seed` while `task dev` is running.

### 3. Login page quick-fill

The login page shows dev account buttons below the form:

```
── Dev accounts ──
[Admin] [User]
```

Clicking fills the email/password fields and submits the form automatically.

### 4. Playwright test updates

Tests use the seed users instead of creating random accounts:
- First test calls `/api/seed` to ensure users exist
- Verifies both admin and user can sign in with known credentials
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
| `Taskfile.yml` | `seed` and `seed:remote` tasks; `seed:remote` in deploy pipeline |
| `tests/auth.spec.ts` | Use seed users, test seed endpoint |
| `tests/login.spec.ts` | Test quick-fill buttons visible |
| `CONTEXT.md` | Document seed user credentials, ADR Taskfile convention |

## Consequences

- Playwright tests are deterministic — no more random emails
- Login page shows quick-fill, reducing dev friction
- Seed credentials are well-known and documented — never use in production
- Admin plugin deferred until needed (avoids premature complexity)
- Deploy pipeline seeds remote DB automatically
