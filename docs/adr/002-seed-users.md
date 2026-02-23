# ADR 002: Seed Users for Development and Testing

**Status:** Proposed

## Context

Developers and Playwright tests need predictable user accounts to work with. Currently, tests create throwaway users with random emails on every run, and developers must manually register through the UI. This is slow and unreliable — tests can't verify role-based features, and devs waste time on setup.

We need two well-known seed users:

| Role | Email | Password | Purpose |
|---|---|---|---|
| Admin | `admin@remy.dev` | `admin1234!` | Admin features, privileged actions |
| User | `user@remy.dev` | `user12345!` | Normal user flows, default testing |

These are **dev/test credentials only** — not for production.

## Decision

### 1. Seed script

Create `src/db/seed.ts` that upserts the two users via Better Auth's `signUpEmail` API. The script is idempotent — it skips users that already exist.

### 2. Taskfile integration

Add a `seed` task that runs the seed script against local D1. Add `seed:remote` for the deployed worker. Wire `seed` into the `setup` task so local dev always has users ready.

```yaml
seed:
  desc: Seed local D1 with dev users (idempotent)
  deps: [setup]
  cmd: # call seed endpoint or script

seed:remote:
  desc: Seed remote D1 with dev users (idempotent)
  cmd: # call seed endpoint on deployed worker
```

### 3. Login page quick-fill

Display the seed user credentials on the login page (only in dev) as clickable buttons so developers can one-click sign in. Show a small card below the form:

```
── Dev accounts ──
[Admin] admin@remy.dev
[User]  user@remy.dev
```

Clicking fills the email/password fields and submits the form.

### 4. Better Auth Admin plugin

Enable the Better Auth `admin` plugin to give the admin user elevated privileges. This lays the groundwork for admin-only routes and features.

### 5. Playwright test updates

Update tests to use the seed users instead of creating random accounts. Add tests that verify:
- Admin user can access admin-only endpoints
- Normal user is blocked from admin endpoints
- Both users can sign in with known credentials

## Implementation

### Files to create/modify

| File | Change |
|---|---|
| `src/db/seed.ts` | New — seed script with admin + user accounts |
| `src/routes/login.ts` | Add dev account quick-fill cards |
| `src/auth.ts` | Enable admin plugin |
| `Taskfile.yml` | Add `seed` and `seed:remote` tasks, wire into `setup` |
| `tests/auth.spec.ts` | Use seed users, add admin vs user tests |
| `CONTEXT.md` | Document seed user credentials |

### Seed endpoint approach

Add a `POST /api/seed` endpoint (gated behind a dev check or secret) that the Taskfile calls via `curl`. This avoids needing a separate script runner — the worker itself handles seeding through its existing auth stack.

## Consequences

- Developers get instant working accounts on `task setup`
- Playwright tests are deterministic — no more random emails
- Login page shows quick-fill in dev, reducing friction
- Admin plugin enables role-based features going forward
- Seed credentials are well-known and documented — never use in production
