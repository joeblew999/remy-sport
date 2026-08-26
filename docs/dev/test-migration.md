# Test migration — what is done, and what is left

**Measured 2026-08-26.** `mise run test:all` for current numbers,
`mise run test:tiers` for the split.

    test:unit      0s   35 tests   pure logic, no runtime
    test:worker    6s   58 tests   the Worker in workerd, real Miniflare D1
    test:render   18s   26 tests   a browser, no backend at all
    test          53s   38 tests   a browser + a real Worker

Started at 151 Playwright tests / 2.8 minutes.

## The rule

> Asserts what the **API returns**? → `tests/worker/`
> Asserts what the **UI does with data it was given**? → `tests/render/`
> Asserts a **real round trip** — sign in, act, the change persists? → e2e

If a test signs in only so a page will render, it does not need to sign in: seed
the cache. `useSession` is a query, so its key is seedable like any other — that
is how the six-role permission grid stopped needing six sign-ins.

Helpers, both written:

- [`tests/worker/helpers.ts`](../../tests/worker/helpers.ts) — `seed()`,
  `signIn()`, `post()`, `actorFor()`.
- [`tests/helpers/seed-cache.ts`](../../tests/helpers/seed-cache.ts) —
  `seedCache()`, `entry()`, typed against the procedure's real return type.

Copy from [`tests/worker/write.test.ts`](../../tests/worker/write.test.ts) (API,
real auth) or [`tests/render/admin.spec.ts`](../../tests/render/admin.spec.ts)
(rendering, seeded session, zero backend).

## What is left in e2e — 38 tests, and most of them belong there

- `spa-login` (9) — the subject *is* the sign-in flow
- `admin-console` (6) — impersonation, ban, role changes that must persist
- `accept-invitation` (6) — real invitation round trips
- `organization` (4) — real org creation
- `devices` (2) — revoking a session and watching it actually end
- `authz` (1) — the role switcher completing a real sign-in
- the rest: 404 paths and the two wiring proofs in `spa.spec.ts`

**These are genuine round trips.** The remaining minute is not a classification
problem any more; it is 38 browser page-loads against a real Worker, which is
what that costs.

The next real lever is the **render tier's 18s**, nearly all of it `vite
preview` starting. A long-lived preview with `reuseExistingServer` would take it
to near zero.

## Non-negotiables, learned the hard way

- **Delete the original when its replacement lands.** Converting without
  deleting is how the suite reached 151.
- **Nothing is mocked in `tests/worker/`.** Real Better Auth, real OTP, real D1
  with the real migrations. Those tests assert authorization; a mocked session
  would assert only that the mock was written correctly.
- **`render` tests seed via `orpc.*.queryKey()`**, never a hand-written fixture
  with an invented shape. The type check is the point: a renamed procedure must
  fail `mise run typecheck`, not a browser run.
- **Check the count after every move.** `Tests N passed` — a merge that looked
  clean silently dropped half the suite once.
- **`mise run check` before committing**, not just `tsc`.

## Known-outstanding, unrelated to the count

- `admin-console` and `authz` occasionally fail under parallel runs and pass in
  isolation — shared rows, not logic. Playwright is held to `workers: 2` for
  that reason. Moving them out of e2e removes the cause.
- Better Auth leaves unhandled rejections on requests it refuses; scoped in
  `vitest.config.ts` with the reason.
- **shadcn/Tailwind was never installed.** `src/web/styles.css` is ~1000
  hand-written lines and the admin console added ~60 more. This is the remaining
  "not using it properly" and nothing has been done about it.

## Measured, so nobody repeats it

A worker test FILE costs **~3s of workerd and Miniflare startup** before a single
assertion — measured with a file containing one `expect(1).toBe(1)`. That is the
whole gap between `test:worker`'s 6s and its 1.4s of actual tests.

What worked:

- **Batching the 163 migration statements** into one `env.DB.batch()` instead of
  `applyD1Migrations`'s sequential walk. Setup 43s → 19s.
- **Merging six worker files into two.** Setup 19s → 7.5s. The first attempt
  looked like it lost half the suite; it had not — the merged file failed to
  *parse*, because three sources each declared `const ADMIN = actorFor("ADMIN")`,
  and vitest reported only the file that loaded. Hoist shared consts, and check
  `Tests N passed` after every merge.

What did not, so do not try again:

- **`isolatedStorage: false`** — no faster, and it loses per-file isolation.
- **Guarding the migration batch** on the schema already existing — no faster,
  because the cost is not SQL.
- **A committed `snapshot.sql`** of the seeded database — `/api/seed` costs 99ms,
  so it solved nothing, and a generated dump is exactly the drifting artifact
  this repo keeps deleting.

The render tier's 18s is nearly all `vite preview` starting. A long-lived preview
with `reuseExistingServer` would take it near zero. That is the next lever.
