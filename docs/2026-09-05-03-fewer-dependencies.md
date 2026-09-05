# Plan — fewer dependencies

## Why

`package.json` lists 45 packages. I checked what each one is used for by
reading the files that import it. Most are needed. Four are not: each one does
something that another package we already have can do, or that we can do
ourselves in a few lines. This plan removes those four, and writes down why
each of the others stays, so nobody has to work that out again.

## The four that go

**1. `@hono/swagger-ui`** — shows the API documentation page at `/doc`.

Our API library, oRPC, already includes its own documentation page
(`OpenAPIReferencePlugin`, in the `@orpc/openapi` package we already have).
Switch `/doc` to that and delete this one. Same page, same address.

**2. `openapi-types`** — one TypeScript type, used in one place
(`src/api/base.ts`) to describe an API operation.

oRPC probably provides that type itself. Check. If it does, use oRPC's and
delete this. If it doesn't, keep it and say so here.

**3. `@inlang/cli`** — runs `inlang validate` during `bun run lint`, which
checks the translation files.

We already check the translation files two other ways: a test
(`tests/repo/messages.test.ts`) confirms every language has every message,
and the build fails if a file is broken. So does `validate` find anything
those two miss? Break a translation file three ways (a missing message, a
broken file, an unknown language) and see. If `validate` finds nothing extra,
delete it.

**4. `@types/bun`** — type definitions for Bun's own functions.

Our scripts call `Bun.spawnSync`, `Bun.spawn` and `Bun.sleep` in 11 files.
Node has equivalents (`spawnSync`, `spawn`, `setTimeout`) that work in both
Bun and Node. Change the 21 call sites, then delete this. The scripts then
run under either runtime.

## The ones that stay

| package | what it does | why it stays |
|---|---|---|
| `@khmyznikov/pwa-install` and `lit` | the "Install app" dialog, with the iOS add-to-home-screen steps | You like its GUI. Thai is missing — your PR #170 upstream adds it. When they release it, bump the version. |
| `temporal-polyfill` | date maths (which day is next) | Not every browser has the built-in Temporal API yet. Delete this the day they do. |
| `@orpc/openapi-client` | one helper that reads a validation error message | It belongs to the library that defines the error format. Copying it would be a fork. |
| `auth` | the Better Auth command-line tool, used to regenerate the auth database schema | Pinned to the exact same version as `better-auth` on purpose. They must match. |
| `@moq/publish` and `@moq/watch` | live video streaming | Set up and working on production. A real feature. |
| `@vite-pwa/assets-generator` | cuts all the app icons from `brand.svg` | Used by `bun run ops icons`. The `sharp` override in `package.json` exists so this and miniflare share one image library instead of installing two. |
| `@tauri-apps/cli`, `@tauri-apps/plugin-log`, `@tauri-apps/plugin-notification` | the desktop and iPhone app shells | **Your decision.** They cost three packages, a Rust toolchain, and ruby + cocoapods in `mise.toml`, and nothing tests them. If desktop and iPhone apps ship this year, keep them. If not, make them install-on-demand. |

## Steps

- [ ] Switch `/doc` to oRPC's documentation page. Delete `@hono/swagger-ui`.
- [ ] Check whether oRPC provides the operation type. Delete `openapi-types`
      if it does.
- [ ] Break a translation file three ways and see what `inlang validate`
      catches that the test and the build do not. Delete `@inlang/cli` if
      nothing.
- [ ] Change the 21 `Bun.*` calls in the scripts to Node's equivalents.
      Delete `@types/bun`. Run one script under `node` to prove it works.
- [ ] Write the reason next to each package that stays (a comment on the line
      that imports it).
- [ ] Ask you about Tauri and write the answer here.

## Done when

`package.json` has 41 packages, and every one of them is either imported
somewhere or has its reason written next to the import.

## Log

- 2026-09-05 — written. Rewritten the same day in plain words, after the
  first version was rightly called cryptic.
