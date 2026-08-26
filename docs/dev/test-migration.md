# Test migration — the job that is not finished

**Status: in progress.** Three test tiers exist and work. ~89 of the 107
Playwright specs are still in the wrong one. This file says exactly which, so
the next session reclassifies them in bulk instead of re-deriving the plan.

## Why this exists

The suite takes 1.6 minutes because there are 107 browser tests, not because
the runner is misconfigured. **107 browser page-loads against a real Worker is
the floor for that count.** The only lever is having fewer of them.

Every earlier attempt optimised the runner — storageState, worker count,
project ordering. That bought 2.8m → 1.6m and then stopped, because it was the
wrong altitude. The population is the problem.

## The three tiers, all already built

| Tier | Runner | What belongs there | Now |
|---|---|---|---|
| `mise run test:unit` | bun test | pure functions, no runtime | 32 tests, 20ms |
| `mise run test:worker` | vitest + workerd | anything asserting what the **API returns** | 23 tests, 649ms |
| `--project=render` | Playwright, **no backend** | anything asserting what the **UI renders** given data | 3 tests |
| `mise run test` | Playwright + real Worker | a genuine round trip: sign in → act → persist | 107 tests, 1.6m |

Nothing new needs building. The helpers exist:

- [`tests/worker/helpers.ts`](../../tests/worker/helpers.ts) — `seed()`, `signIn()`,
  `post()`, `actorFor()`. A worker test is ~5 lines of setup.
- [`tests/helpers/seed-cache.ts`](../../tests/helpers/seed-cache.ts) — `seedCache()`,
  `entry()`. Type-safe against the oRPC procedure's real return type.

Worked examples to copy: [`tests/worker/authz.test.ts`](../../tests/worker/authz.test.ts)
(API, with real auth), [`tests/team-render.spec.ts`](../../tests/team-render.spec.ts)
(rendering, zero backend).

## The classification

Counted, not estimated — `request` means the test uses Playwright's `request`
fixture and never opens a browser.

| Spec | tests | → `tests/worker/` | → `render` | stays E2E |
|---|---|---|---|---|
| `org-teams.spec.ts` | 12 | **11** | — | 1 |
| `reference.spec.ts` | 8 | **7** | — | 1 |
| `authz.spec.ts` | 10 | 4 | 4 | 2 |
| `teams.spec.ts` | 7 | 4 | 3 | — |
| `home.spec.ts` | 6 | 3 | 2 | 1 |
| `spa.spec.ts` | 10 | 2 | **8** | — |
| `devices.spec.ts` | 7 | 2 | 3 | 2 |
| `i18n.spec.ts` | 7 | — | **7** | — |
| `accept-invitation.spec.ts` | 6 | — | 3 | 3 |
| `admin-console.spec.ts` | 8 | — | 4 | 4 |
| `spa-login.spec.ts` | 9 | — | 4 | 5 |
| `organization.spec.ts` | 4 | — | — | 4 |
| `invitations.spec.ts` | 4 | 4 | — | — |

**Target: ~23 Playwright E2E tests.** Everything else moves.

### Do these first — pure conversions, no judgement needed

`org-teams.spec.ts` (11) and `reference.spec.ts` (7) are entirely `request`
tests. They convert mechanically against `tests/worker/helpers.ts` and the
originals get deleted. That is 18 tests out of the slow tier in one sitting.

`i18n.spec.ts` (7) and `spa.spec.ts` (8) are the biggest rendering wins — they
assert what the DOM says about data, so they seed the cache and need no server.

## The rule for classifying one test

> Does it assert what the **API returns**? → `tests/worker/`
> Does it assert what the **UI does with data it was given**? → `render`
> Does it assert a **real round trip** — sign in, act, and the change persists? → E2E

If a test signs in only so a page will render, it does not need to sign in: seed
the cache instead.

## Non-negotiables, learned the hard way

- **Delete the original when its replacement lands.** Converting without
  deleting is how the suite got to 107.
- **Nothing gets mocked in `tests/worker/`.** Real Better Auth, real OTP, real
  Miniflare D1 with the real migrations. Those tests assert authorization; a
  mocked session would assert only that the mock was written correctly.
- **`render` tests seed via `orpc.*.queryKey()`**, never a hand-written fixture
  object with an invented shape. The type check is the whole point — a renamed
  procedure must fail `mise run typecheck`, not a browser run.
- **Playwright is held to `workers: 2`** by shared-D1 races between files. Every
  test moved out of that tier is one that can run fully parallel, because
  `isolatedStorage` gives each worker test file its own database.
- **Run `mise run check` before committing.** It is types + unit + worker + dead
  code + documented paths + the rules in AGENTS.md.

## Known-outstanding, unrelated to the count

- `admin-console.spec.ts` and `authz.spec.ts` occasionally fail under parallel
  runs and pass in isolation — shared rows, not logic. Moving them out of E2E
  removes the cause.
- Better Auth leaves unhandled rejections on requests it refuses; scoped in
  `vitest.config.ts` with the reason.
