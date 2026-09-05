# Plan — modern tools do what `scripts/` does by hand

## Why

On 2026-09-05 a dependency update took one command and half a day. None of the
half day was the dependencies. It was a tsconfig still on ES2020, a type
package a tsconfig named that nothing in package.json listed, a watcher that
had left 114 copies of index.js in dist/, and a check that blamed a leaked
import for it. The Product Owner's words: "most of the checks are only needed
due to poor design choices." Measured that day, they are right:

| | lines |
|---|---|
| product code, `src/` | ~24,500 |
| `tests/` | ~17,700 |
| `scripts/` | 10,007 — 42% of it comments explaining why it exists |
| config files at the root | 18 |

Twelve of the fifteen checks guard drift between two hand-kept copies of one
fact — the tables map and the schema, the seed and its foreign keys, prose and
the tree, fifteen "convention" rules. The fix for a copy is not a guard; it is
one copy. Three checks are product invariants and stay (see *Kept*).

## The target

- `bun run dev` — Vite, with the Cloudflare Vite plugin running the Worker in
  workerd. No dist/ during development.
- `bun run check` — `tsc`, then Vitest, then Playwright. One runner each,
  and the repo's own checks are test files under that runner.
- `bun run build`, `bun run deploy -- --env staging` — `vite build`, then
  wrangler: deploy, migrations, smoke.
- `mise.toml` keeps `[tools]` and `[env]`. No tasks.
- `scripts/` under 2,000 lines. Nothing runs before every command.

## Rules

- **The gate is green on every commit.** A phase may take several commits;
  each one is green on its own.
- **Delete, or derive.** A box that adds a file deletes a bigger one.
- **The product does not change.** No endpoint, screen, message or assertion
  moves except to a different runner, verbatim. `bun run shots` before
  and after a phase must show the same screens.
- **Progress is recorded here and nowhere else.** Tick the box in the commit
  that does it. What cannot be done is written under the box with the reason,
  and the loop moves on.
- **One tool per job, and the tool's own conventions.** Where Vite, Vitest,
  Playwright or wrangler already has a way, use it; do not wrap it.

## Phase 1 — one runner, one tsconfig, `package.json` scripts

- [x] `package.json` scripts: `dev`, `check`, `test`, `build`, `deploy`, `db`,
      `ops` — each a one-liner over the tool itself. The six mise tasks are
      gone; `[tools]` and `[env]` stay.
- [x] One `tsconfig.json`. Not project references: `tsc -b` needs each
      project to emit declarations for its dependents, and nothing here emits.
      One config over src, tests and scripts does the job with one `tsc` —
      and typechecked `scripts/` for the first time, which found 32 errors,
      one of them a report whose `--env` filter was computed and never applied.
- [x] Vitest projects: unit (node), repo (the rules), worker (the Workers
      pool). The unit tier moved from `bun:test` to Vitest, assertions
      verbatim; `bun run test:watch` is the watcher.
- [x] Every check became a test file under `tests/repo/`, assertions
      verbatim, including the ones later phases delete — the gate must not
      lose a rule between phases, and deleting a test file is one command.
      The orchestrator (855 lines), its watcher and its budgets are gone;
      Vitest reports slow files itself.
- [x] Playwright: three configs to two. The screenshot walk is a project of
      the e2e config, since its environment was that tier's. The render tier
      keeps its own config on purpose: `webServer` is config-wide in
      Playwright, and the whole point of that tier is to start no Worker.
- [x] `prepare.ts`: `bun run setup` runs it once. Phase 2 removed its
      bundle step and the watcher guard; `deploy` still runs its build half
      (install, fonts, types) at its start, which phase 3 and 4 shrink.
- [ ] `eslint.config.mjs` exists for the i18n rule alone. Keep if Vitest
      cannot host that rule cheaply; otherwise a repo test and eslint goes.

**Done when** `bun run check` is the gate, `mise.toml` has no `[tasks]`, and
the orchestrator does not exist. (2026-09-05: it is, it has none, it does not.)

## Phase 2 — the Cloudflare Vite plugin

- [x] The plugin in `vite.config.ts`; `vite dev` runs the Worker in workerd
      beside the SPA with HMR, and `vite build` writes dist/client and
      dist/remy_sport with the wrangler.json the publish names. `--mode
      render` leaves the plugin out, which is how the render tier stays a
      static file server.
- [x] The dev script deleted (303 lines). The tunnel is `bun run ops tunnel -- --run`;
      wait-for-health went with the process it waited for; the seed is a
      ten-line Vite plugin that posts to `/api/seed` when the server is
      listening, until phase 3 makes it a function.
- [x] Everything that existed because dist/ was written during development
      is gone: the prune plugin, the `emptyOutDir` reasoning, the watcher
      guard in `prepare.ts`, the stop-and-restore of the dev server in
      `scripts/deploy.ts`, the refusal in `e2e.ts`, the `--host` convention. Kept,
      because they were never about that: `tests/repo/assets.test.ts` (a
      built file shadowing a Worker route is a deploy-time hazard) and the
      leak list in `tests/repo/bundle.test.ts` (the SW still shares a type
      with src/api). Both read dist/client now.
- [ ] `tests/repo/envs.test.ts` asks whether two environments share data or traffic. Answer it
      from the config once, as a repo test, if the plugin's config layout does
      not make it obvious.

**Done when** development is `vite`, there is no dist/ until `vite build`, and
the dev script and the file watcher are gone. (2026-09-05: it is, there is not, they are.)

## Phase 3 — one seed, one table map, fonts committed

- [ ] One seed function in `src/db` — drizzle inserts from the model, in
      dependency order as code, so a wrong order is a foreign-key error with a
      name. Used by the `/api/seed` endpoint, the worker tier's setup and
      development. The generated seed.sql, `seed.ts` (471 lines), `tests/repo/seed-order.test.ts`
      and the check that the SQL matches the model all go.
- [ ] `FIXTURE_TABLE` gets `satisfies Record<model table name, SQLiteTable>` —
      the same construction that fixed the vocabulary maps on 2026-09-05 —
      and `tests/repo/tables.test.ts` goes.
- [ ] `tests/repo/fixture-ids.test.ts`: a test naming a row that does not exist already fails
      in the worker tier at runtime. Measure whether a render-tier seed can
      name a row nothing checks; delete the check unless it can.
- [ ] `fonts.css` and the woff2 files committed; `fonts.ts` (192 lines) goes.
- [ ] `tests/repo/seed-coverage.test.ts` measures the product (a column no row fills). It
      stays, as a repo test.

**Done when** "seed" is one function and `scripts/lib` holds only what talks to
Cloudflare and writes `.dev.vars`.

## Phase 4 — deploy is wrangler

- [ ] `deploy` = `wrangler deploy --env X`, `wrangler d1 migrations apply`, then
      `smoke.ts` as a test pointed at the URL.
- [ ] `provision.ts` (750 lines) and the bespoke Cloudflare API client in
      `cloudflare.ts` (548) become a one-time per-environment setup using
      wrangler's own commands. What wrangler cannot do stays, with the reason on
      the line.
- [ ] `versions.json` stamping goes. The dev build rewrites a tracked file on
      every run; `build-stamp.tsx` already compares content hashes and needs
      none of it.
- [ ] `auth-schema.ts`: establish whether Better Auth's schema generation is a
      build step or a one-time one, and place it accordingly.

**Done when** `deploy.ts` is under 100 lines or gone.

## Kept, and why

- `tests/repo/authz.test.ts` — every procedure declares how it is authorised. A product
  invariant; becomes a repo test.
- `tests/repo/actions.test.ts` — every action the model grants has a screen or a written
  reason. Same.
- `tests/repo/notifications.test.ts` — everything the platform sends can be turned off. Same.
- `tests/repo/docs.test.ts`, `tests/repo/text.test.ts` — tiny; repo tests.
- `tests/repo/messages.test.ts` — if `inlang validate` already proves it, delete; measure.
- `tests/repo/conventions.test.ts` — each of its fifteen rules is re-read as the phase that
  deletes the thing it guards lands. A rule about a deleted thing goes with it.
- knip and dependency-cruiser — standard tools with three rules between them
  that say which layer may import which. Kept as they are.

## Blocked by the ecosystem, not by this repo

- TypeScript 7: typescript-eslint (`<6.1.0`), knip and dependency-cruiser use
  the JavaScript compiler API that 7 no longer ships. On 6.0.3; re-check monthly.
- Vitest 5: the Workers pool pins `^4.1.0`.

## Log

- 2026-09-05 — written, after the dependency update (`f3cb2eb`) and the
  watcher fix (`3af69a0`). Baseline numbers above.
- 2026-09-05 — Phase 2 landed, one commit. `bun run dev` is `vite`: the
  Worker in workerd with its bindings and .dev.vars, the SPA with HMR, seeded
  on start; `bun run build` writes dist/client and dist/remy_sport in ~3 s;
  `vite preview` runs the build in workerd. The dev script (303 lines), the
  prune plugin, the watcher guard, the deploy's stop-and-restore and the e2e
  refusal are gone with the race they policed. Gate ~60 s (it builds now);
  e2e 34 passed in 22 s against the Vite server.
- 2026-09-05 — Phase 1 landed, one commit. `scripts/` 10,007 → 6,786 lines;
  root config files 18 → 16; 95 files, +895 −1,822. The gate is
  `bun run check`, ~55 s end to end: `tsc` 4 s, lint 5 s, Vitest 754 tests in
  18 s (unit, repo, worker), the render tier 258 in 26 s; `bun run test:e2e`
  34 in 14 s. Found on the way: `scripts/` had never been typechecked — 32
  errors, one of them `ops analytics` computing its `--env` filter and never
  applying it, so every report mixed three deployments; and the worker tier's
  `isolatedStorage: true` had been silently stripped by the pool's option
  schema for as long as it was there.
