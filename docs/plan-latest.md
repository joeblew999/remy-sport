# Plan — every dependency at latest, and staying there

## Where we are

Measured 2026-09-05, after [plan-modern-tooling.md](plan-modern-tooling.md)
landed. `bun outdated` lists two packages; `mise` pins six tools, all behind.

| | now | latest | what holds it |
|---|---|---|---|
| `typescript` | 6.0.3 | 7.0.2 | 7's npm package ships the native compiler and no JavaScript compiler API. Two tools here use that API: `@typescript-eslint/parser` (peer `<6.1.0`) and dependency-cruiser's TypeScript extractor. knip does not — it parses with oxc. Nothing else in package.json touches it. |
| `vitest` | 4.1.11 | 5.0.0 | `@cloudflare/vitest-pool-workers` pins `^4.1.0`. Its successor `@cloudflare/vitest-plugin` 1.1.4 (same API, renamed for v1 on 2026-08-19) pins the same. Cloudflare's to lift. |
| bun | 1.3.11 | 1.4.0 | nothing |
| node | 24.14.1 | 26.8.1 | nothing — and `@types/node` is already 26, typing a Node newer than the one that runs wrangler and Vite here |
| jq | 1.8.1 | 1.8.2 | nothing |
| fnox | 1.34.0 | 1.35.0 | nothing |
| cloudflared | 2026.8.2 | 2026.8.3 | nothing |
| ruby | 3.4.9 | 4.0.6 | only the iOS toolchain uses it (cocoapods, `COCOAPODS_VERSION` 1.17.0), and no gate here exercises that — a bump is verified by `pod --version` and nothing more |

Everything else — 46 packages — is at latest already.

## The target

- `bun update --latest && mise upgrade --bump && bun run check` is the whole
  operation, every time, with nothing to remember.
- Two tools fewer. ESLint exists here for three copy rules; dependency-cruiser
  for five import rules. Both are AST walks, and the parser Vite 8 already
  ships (oxc, which knip also uses) can do them as repo tests. That removes
  five packages, two root config files, and the last consumers of the API
  TypeScript 7 dropped.
- Updates arrive as pull requests against a green gate, not as a half-day.

## Rules

The same as the last plan's: the gate is green on every commit; delete, or
derive; the product does not change — a copy rule that moves runners must
still flag the same lines, proven by keeping the old tool alive until the new
test reports the same findings on the same tree.

## Phase A — the two parsers go

- [x] A repo test for the copy rules, on `oxc-parser`: a JSXText literal that
      is not a glyph or the brand; a string literal inside a JSX expression
      matching `^[A-Z][a-z]` that is not an attribute; a `placeholder`, `title`,
      `alt` or `aria-label` with two letters in it; a string literal in a
      `return` in `src/web/**/*.ts` with two words. The allowed-strings list
      moves verbatim from `eslint.config.mjs`, and so does every reason in that
      file's comments — they are the rule's history. Proven: the test lists
      zero problems on the tree ESLint passes, and a fixture of six known-bad
      snippets fails it six times.
- [x] A repo test for the import rules, on the same parser: the Worker never
      imports `src/web`; `src/web` reaches only `src/web`, `src/domain` and
      `src/paraglide` at runtime (type-only imports excepted); a screen never
      imports `src/domain/grants.ts`; `src/domain` never reaches `src/api`,
      `src/routes`, `src/web` or `src/mail`; no cycle, except the drizzle
      schema files, whose thunked references are the documented pattern. The
      reasons move verbatim from `.dependency-cruiser.cjs`. Proven the same way.
- [x] `eslint`, `eslint-plugin-react`, `@typescript-eslint/parser`,
      `dependency-cruiser`, `eslint.config.mjs` and `.dependency-cruiser.cjs`
      deleted; `lint` is knip and inlang. Equivalence proven before deleting
      either tool: the copy rules flag the same 8 of 17 fixture snippets ESLint
      flags and the same lines on the tree; the import rules and
      dependency-cruiser each fire on all five one-rule-per-file fixtures and
      neither fires on a type-only import from the SPA. Both fixtures are
      committed as the tests' own cases, so a rule that stops walking the right
      node fails rather than falls silent.

## Phase B — TypeScript 7

- [ ] `bun add -d typescript@7`. `tsc` is the native compiler. Fix what it
      rejects in tsconfig.json — 7 dropped `baseUrl`, `outFile` and the old
      resolution modes; this config uses none, but the run says.
- [ ] Nothing else should need to change: no package left imports the API.
      If one does, it goes on the table above with its reason.

## Phase C — the Workers Vitest integration, by its new name

- [ ] `@cloudflare/vitest-pool-workers` → `@cloudflare/vitest-plugin`: the
      dependency, the import in vitest.config.ts, the `types` entry in
      tsconfig.json. Same API, same options.
- [ ] Vitest 5 the day the plugin's peer range allows it. Until then the
      table above is the answer, and `bun outdated` will keep saying so.

## Phase D — the tools

- [ ] mise.toml: bun 1.4.0, node 26.8.1, jq 1.8.2, fnox 1.35.0, cloudflared
      2026.8.3. `mise install`, then the gate — node is what runs wrangler,
      Vite and Playwright, so this is the one that could bite.
- [ ] ruby 4.0.6, with `RUBY_BIN` in `[env]` following it (it carries the
      version in its path). Verified by `mise install` building it and
      `pod --version` answering; if cocoapods 1.17 refuses Ruby 4, ruby stays
      on 3.4.10 with that written here.

## Phase E — staying there

- [ ] `bun run ops deps update` is `bun update --latest` followed by
      `mise upgrade --bump`, so there is one command and it is the one this
      plan ran.
- [ ] `.github/dependabot.yml`: npm weekly, grouped into one pull request,
      plus GitHub Actions. And `.github/workflows/check.yml`, so that pull
      request runs `bun run check` and `bun run test:e2e` — the gate needs
      nothing from Cloudflare: workerd, a local D1 and the dev outbox are all
      local. Without the workflow a dependency bot is noise; with it, an
      update is a green tick or a red one, and either takes a minute to read.

**Done when** `bun outdated` prints nothing but the Vitest line, `mise
outdated` prints nothing, and the last dependency PR merged green without a
human running anything.

## Log

- 2026-09-05 — written. The dependency update that morning took one command
  and half a day; the half day is now [plan-modern-tooling.md](plan-modern-tooling.md).
