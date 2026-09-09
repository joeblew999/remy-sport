# Plan — a distinct install name per environment

Status: implemented and verified locally 2026-09-08. The manifest name is now
derived from the build's environment via a single source of truth
(`src/web/lib/install-name.ts`), and a repo check asserts the built manifest
names its environment. Verified by building all three environments and by the
full check (899 unit/repository/Worker checks, 334 rendering checks). The only
outstanding step is device verification of the two home-screen labels.

## What is wrong

The web manifest is written by `vite-plugin-pwa` in `src/web/vite.config.ts`
with a fixed identity:

```ts
manifest: {
  name: "Remy Sport",
  short_name: "Remy",
  ...
}
```

Every environment ships the same name. A reader who installs the local app and
then the staging app gets two home-screen icons that both say **Remy** — there
is no way to tell which is which without opening them. The Product Owner wants
the name to carry the environment.

## Where the environment already comes from

The build already knows which environment it is for. `scripts/deploy.ts` sets
`CLOUDFLARE_ENV` for every non-production build (`envFor`), and
`src/web/vite.config.ts` reads it in `stamp()` to bake `__BUILD__.environment`
into the Worker:

- `dev` — the local dev server (`bun run dev`), which serves on `localhost`.
- `staging` — `bun run deploy -- --env staging`.
- `production` — the top-level configuration, which has no name, so
  `CLOUDFLARE_ENV` is unset and `stamp()` resolves it to `production`.

The manifest is generated in the same file, at the same build time, so it can
derive its name from the same value. No new environment plumbing is needed.

## The naming scheme

One mapping from the environment to a display label, used for both `name` and
`short_name`. Production keeps the current product name; every other
environment gets a suffix that names it.

| Environment | `CLOUDFLARE_ENV` | `name` | `short_name` |
| --- | --- | --- | --- |
| local dev | `dev` | `Remy Sport (localhost)` | `remy-localhost` |
| staging | `staging` | `Remy Sport (staging)` | `remy-staging` |
| production | *(unset)* | `Remy Sport` | `Remy` |

The `name` is what install dialogs and the app switcher show; `short_name` is
what iOS puts under the home-screen icon. Both change so the label is distinct
everywhere a reader might look.

**Length note — accepted.** iOS truncates the home-screen label to about 12
characters, so `remy-localhost` renders as `remy-localhos…`. The Product Owner
confirmed on 2026-09-08 that this truncation is acceptable; `remy-staging` (12
characters) fits exactly. No shorter alternative is needed.

## Where things live afterwards

- **One source of truth for the environment.** The environment is computed
  **once**, at the top of the `defineConfig(({ mode, command }) => …)` callback
  in `src/web/vite.config.ts`:

  ```ts
  const environment = process.env.CLOUDFLARE_ENV ?? (command === "serve" ? "dev" : "production")
  ```

  That single value feeds **both** `stamp()` (which bakes
  `__BUILD__.environment`, served at `/api/versions`) **and** the manifest
  `name` / `short_name`. Because both derive from the same variable in the same
  scope, they cannot disagree — there is exactly one derivation of "what
  environment is this build", never two. The manifest must **not** re-derive
  the environment on its own; that would be a second source of truth and would
  let the two drift.
- The environment → label mapping (`dev → localhost`, `staging → staging`,
  production → none) is a small build-time table in `src/web/vite.config.ts`,
  keyed off that single `environment` value. It lives in the web build config
  because the manifest is a web-build concern; it does not belong in the Worker
  runtime policy in `src/environment.ts`.
- The manifest `id` stays `/`. It pins the app's identity **per origin**, and
  each environment is a different origin, so a distinct name cannot collide
  with another environment's install. No change there.
- The Tauri native app name (`src-tauri/tauri.conf.json`) is out of scope: it
  is the packaged desktop/mobile shell, not an A2HS install, and the Product
  Owner asked about the web install path.

## Steps

- [x] **Compute the environment once and share it.** In `src/web/vite.config.ts`,
      the `CLOUDFLARE_ENV` resolution is hoisted into a single `environment`
      value at the top of the `defineConfig` callback. `stamp()` reads it for
      `__BUILD__.environment`, and the manifest reads the same value for
      `name` / `short_name` via `installName()` in `src/web/lib/install-name.ts`
      — one source of truth, imported by both the build and the check.
      Production resolves to exactly `Remy Sport` / `Remy` — the same strings
      shipped today — so the change is invisible in production.
- [x] **Make the environment visible to a check.** `tests/repo/manifest.test.ts`
      now reads the **built** `dist/client/manifest.webmanifest` and asserts its
      `name`/`short_name` match `installName(CLOUDFLARE_ENV ?? "production")`.
      Verified it fails loudly when a staging build is checked as production.
- [x] **Verify each environment's build.** Built for `dev` (served), `staging`
      and `production` and confirmed the emitted manifest carries the right
      name in each case, and that the production build is unchanged.
- [ ] **Confirm on a device.** On a real phone, install from localhost and from
      staging and confirm the two home-screen labels differ. This is the
      Product Owner's acceptance criterion; it needs the same device
      verification the iOS links investigation
      ([installed web apps and links](2026-09-08-04-ios-installed-web-app-links.md))
      is waiting on.

## Acceptance

- `bun run check` is green, including the new manifest-name assertion.
- The built manifest for each environment names that environment; production
  is unchanged (`Remy Sport` / `Remy`).
- On a device, an install from localhost and an install from staging show two
  distinct home-screen labels.
