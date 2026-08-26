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

## The worker tier's remaining cost, measured

`mise run test:worker` is ~5s for 56 tests that themselves take 1.6s. The gap is
**~3s of workerd and Miniflare startup per test FILE** — measured directly with a
file containing one `expect(1).toBe(1)`. Six files, ~18s.

Two things were tried and did not help, so do not repeat them:

- **`isolatedStorage: false`** — no faster, and it loses per-file database
  isolation. Reverted.
- **Skipping the migration batch when the schema already exists** — no faster,
  because the cost is not SQL. Reverted.

Batching the 163 migration statements into one `env.DB.batch()` instead of
`applyD1Migrations`'s sequential walk **did** help: setup 43s → 19s.

**The only remaining lever is fewer files.** Merging six into two took setup to
7.3s — but the merge silently lost half the tests (52 `it()` in the files, 26
reported by vitest) and was reverted rather than shipped. Redo it carefully, one
file at a time, checking `Tests N passed` after each move.

## And the render tier

15s, for 15 tests that make no network call at all. Almost all of it is `vite
preview` starting. A prebuilt static server reused across runs, or Playwright's
`reuseExistingServer` with a long-lived preview, would take this to near zero.
