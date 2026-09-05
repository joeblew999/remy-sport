# Plan — fewer dependencies, each one earning its place

## Where we are

Measured 2026-09-05, with everything at latest ([2026-09-05-02-latest.md](2026-09-05-02-latest.md)):
45 packages in `package.json` (19 runtime, 26 dev), 974 MB of `node_modules`.
Every one was read against the files that import it. Most earn their place —
the ORM, the validator, the router, the two test runners, the Workers plugins.
The ones below do not, or do a job the product could do better in its own
words.

| package | imported by | what it is here for | the case |
|---|---|---|---|
| `@khmyznikov/pwa-install` + `lit` | `src/web/main.tsx` (one element) | the install dialog, and iOS's "add to home screen" instructions | **stays — the Product Owner's call, 2026-09-05: its GUI is exactly what readers need.** It bundles ten languages chosen from `navigator.language`, and Thai is not one of them, so a Thai reader gets English today. The Product Owner has already contributed Thai upstream (PR #170, open); the package is bumped when the release carrying it ships. `lit` is its framework and stays with it. |
| `@hono/swagger-ui` | `src/index.ts` (`/doc`) | a reference UI over `/openapi.json` | `@orpc/openapi`, already here, ships `OpenAPIReferencePlugin` — the same document, rendered by the package that generates it. |
| `openapi-types` | `src/api/base.ts` (one type) | `OpenAPIV3_1.OperationObject`, to type the `spec` customiser on `authedRoute` | measure whether oRPC's own route types carry the operation type; if they do, the package is a second spelling of the same thing. |
| `@inlang/cli` | `lint` (`inlang validate`) | "the project is valid" | `tests/repo/messages.test.ts` checks every locale carries every message, and the paraglide compile in `vite build` fails on a broken file. Measure what `validate` adds; delete it if the answer is nothing. |
| `@types/bun` | 11 scripts (`Bun.spawnSync` ×16, `Bun.spawn` ×3, `Bun.sleep` ×2) | typing the Bun globals scripts call | node 26 runs TypeScript directly. Scripts that speak `node:child_process` and `setTimeout` run under either runtime, and need one set of runtime types instead of two. |
| `temporal-polyfill` | `src/web/lib/api.ts` (five `PlainDate` calls) | date arithmetic on ISO days | **stays.** Temporal is not yet in Vite's baseline target (Safari 16). The day it is, this is one import to delete; the call shape is already Temporal's. |
| `@orpc/openapi-client` | `src/web/lib/form-errors.ts` (one helper) | `getIssueMessage`, reading a validation issue out of an error | **stays.** One function from the package that owns the error format; a hand copy would be a fork of oRPC's internals. |
| `auth` | `bun run ops auth-schema`, one repo test | the Better Auth CLI | **stays**, pinned to `better-auth`'s exact version on purpose — lockstep is the point, and `bun x auth@latest` would break it. |
| `@moq/publish` + `@moq/watch` | `src/web/components/moq-video.tsx` | live video over Cloudflare's MoQ relay | **stays.** Provisioned on production (`MOQ_RELAY_TOKEN` is set there), so it is a shipped feature, not dormant code. |
| `@vite-pwa/assets-generator` + the `sharp` override | `bun run ops icons` | cutting every icon from brand.svg | **stays.** The override exists so this and miniflare share one native `sharp` instead of two binary sets; removing the package would move `pwa-assets.config.ts` out of the typecheck for a net gain of one line. |
| `@tauri-apps/cli`, `plugin-log`, `plugin-notification` | `src/web/main.tsx`, `push.ts`, `native-notify.ts` | desktop and iOS shells | **the Product Owner's.** Three packages, a Rust toolchain, and ruby + cocoapods in `mise.toml` for a target that has no gate here. If desktop and iOS ship this year they stay; if not, they become an on-demand setup. Not decided in this plan. |

## The target

- 45 → 41 packages, and each of the four that goes takes a second copy of
  something with it: a second reference UI, a second operation type, a second
  message check, a second runtime's types.
- The install dialog speaks Thai — by the element learning it, not by the
  product replacing the element.
- `lint` is knip. Scripts run under node or bun.

## Rules

The last two plans': the gate is green on every commit; delete, or derive; the
product does not change — except where a box says it does, and then it says
how a reader will notice.

## Phase A — the product says it in its own words

- [ ] Thai for `<pwa-install>` is already upstream: the Product Owner's
      PR #170 "Add Thai (th) locale" (khmyznikov/pwa-install, 2026-09-02),
      open, ahead of the latest release v0.6.4 (June). Nothing to write here —
      bump the package when the release that carries it ships, and Thai
      readers get the dialog in Thai. Until then they see English, and the
      Product Owner has accepted that over replacing an element whose GUI is
      right. One limit stays either way and is worth knowing: the element
      follows the phone's language, not the app's switch.
- [ ] The API reference is `OpenAPIReferencePlugin` from `@orpc/openapi`,
      served where `/doc` is now. `@hono/swagger-ui` goes. Same document, same
      URL.
- [ ] `openapi-types`: measure whether oRPC's route types name the operation
      object. If they do, `authedRoute.spec` is typed from them and the package
      goes; if not, it stays and this line says why.

## Phase B — one of each

- [ ] `inlang validate`: break `messages/th.json` three ways — a missing key, a
      malformed file, an unknown locale — and record which of the three the
      repo test and the paraglide compile already catch. Delete `@inlang/cli`
      if that is all three; otherwise the gap becomes a case in
      `tests/repo/messages.test.ts` and then it goes.
- [ ] Scripts speak node's API: `Bun.spawnSync` → `spawnSync`, `Bun.spawn` →
      `spawn`, `Bun.sleep` → a promise over `setTimeout`, `import.meta.dir` →
      `import.meta.dirname`. Twenty-one call sites in eleven files, all
      mechanical. `@types/bun` goes. Proven by the gate, and by one script run
      under `node` rather than `bun`.

## Phase C — the ones that stay, said once

- [ ] `temporal-polyfill`, `@orpc/openapi-client`, `auth`, the MoQ pair and
      the icon generator each get their reason on the line that imports them,
      so the next person reading `package.json` against the tree does not
      re-derive this table.
- [ ] The Tauri question goes to the Product Owner with the cost stated:
      three packages, a Rust toolchain, ruby and cocoapods in `mise.toml`, and
      no gate. Whichever way it goes, the answer is written here.

**Done when** `package.json` is 41 lines of dependencies, every one of which
either has an importer in `src`, `scripts` or `tests` or a reason beside that
importer — and, once the upstream translation ships, a Thai reader who taps
"Install app" reads Thai.

## Log

- 2026-09-05 — written, the same day as the two plans before it.
