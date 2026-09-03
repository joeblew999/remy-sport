# PWA fixes: four commits

**This file is scaffolding and should be deleted when the last commit below
lands.** `AGENTS.md` says not to write documents, and it is right — the four
things described here are a diff, and a diff describes itself. It exists because
it was asked for, it lives under `docs/` so that `scripts/check/docs.ts` fails
the gate if any path in it rots, and its whole content becomes redundant the
moment the work is done.

Everything below was checked against the tree on 2026-09-03, not inferred from
the brief.

## What was verified, and the one thing that was not

| Claim | Status |
| --- | --- |
| `lanAddress()` can throw | Confirmed — `scripts/dev.ts:39`, unguarded `Bun.spawnSync(["ipconfig", …])` |
| `tunnelToken()`'s `read()` can throw | Confirmed — `scripts/dev.ts:57`, unguarded `Bun.spawnSync(["fnox", …])` |
| The correct pattern already exists | Confirmed — `fnoxGet()` in `scripts/lib/cloudflare.ts:367`, whose docblock names this exact failure: "`Bun.spawnSync` **throws** on a missing executable rather than returning a non-zero `exitCode`" |
| Recommended icon sizes are missing | Confirmed — `pwa-assets.config.ts:22` passes bare `minimal2023Preset`, which is `{transparent: [64,192,512], maskable: [512], apple: [180]}` |
| No iOS startup images | Confirmed — no `apple-touch-startup-image` anywhere in `src/web/index.html` |
| `pwa-push-verification-proof.md` <!-- docs-check-ignore --> | **Not in this repo.** The evidence could not be read. Every fix below stands on direct inspection instead. |

The generator was run against the proposed config in a scratch directory, so the
filenames, counts and byte sizes below are measured.

## Commit 1 — `lanAddress()` cannot throw

`scripts/dev.ts`. Wrap the `ipconfig` call in try/catch and return `null`, the
same shape `fnoxGet()` already uses for the same class of problem: an absent
binary is a lookup that found nothing, not an error.

`ipconfig` is macOS-only, so today `bun scripts/dev.ts` dies on Linux, in CI and
in a fresh container before it starts anything.

## Commit 2 — `tunnelToken()`'s `read()` cannot throw

`scripts/dev.ts`, the local `read()` closure. Identical treatment. This is a
second, unguarded copy of the call `fnoxGet()` fixed; it was never updated to
match.

Worth knowing while making the change: that closure is now byte-for-byte
`fnoxGet("TUNNEL_RUN_TOKEN")`. Importing it instead would delete the duplicate
rather than patch it, which is what the header of `scripts/lib/cloudflare.ts`
asks for ("Credential, account, target and what an error means are defined here
once"). The cost is that `scripts/dev.ts` would newly pull `wrangler` into its
import graph at startup, which it currently does not. The literal try/catch is
what was specified and is what gets committed unless that trade is taken
deliberately.

### Acceptance for both

`bun scripts/dev.ts` runs to completion on a machine with neither binary,
falling through to the existing no-token local-only path. Testable without
uninstalling anything by running it with a `PATH` containing only bun's own
directory — the same trick `tests/unit/cloudflare.test.ts` uses, which passes a
fake binary name to `fnoxGet` to reach the absent-binary branch.

## Commit 3 — the missing icon sizes

`pwa-assets.config.ts` gains explicit `transparent` and `maskable` size lists on
top of the spread preset. `favicons: [[48, "favicon.ico"]]` is the preset's own
default, so the existing favicon does not change.

Then regenerate. **The task is `mise run ops icons`, not `mise run brand:icons`**
— the latter is named in two comments and does not exist (see the last section).

It runs the assets generator *and* `tauri icon`, and the second half is not
idempotent. Measured, twice, with `brand.svg` untouched: every existing file in
`src/web/public/` comes back byte-identical, but `tauri icon` rewrites
`src-tauri/icons/icon.icns` with different bytes at the same 85,086-byte length
on every run. So **each of these commits ends with
`git checkout -- src-tauri/icons/icon.icns`**, and the stop-condition is any
*other* file moving. Without that step the icon commits carry an 85 KB binary
diff that belongs to neither of them.

Five new files land in `src/web/public/`, about 68 KB for the whole icon set:
`pwa-384x384`, `pwa-1024x1024`, and maskable at 192, 384 and 1024.

Then five matching entries in the `icons` array of `src/web/vite.config.ts`,
in the shape the existing ones use. They are listed rather than globbed on
purpose — the comment above `VitePWA({…})` explains why, and
`scripts/deploy/smoke.ts:231` enforces it by fetching every icon the manifest
names.

## Commit 4 — iOS startup images

`createAppleSplashScreens()` in the same config. Three things the brief's
version needs, all found by running it:

**The head links do not write themselves.** The generator *prints* 38
`<link rel="apple-touch-startup-image">` tags to stdout and never touches
`src/web/index.html`. Without adding them the check still flags the same thing
and iOS still shows a blank splash — the fix as written produces 38 PNGs that
nothing references.

**The printed hrefs are wrong.** They say `apple-splash-portrait-light-2048x2732.png`;
the generated files are `apple-splash-portrait-2048x2732.png`. The name template
receives `dark: undefined` during generation and `dark: false` during link
generation, and only the second spells `-light-`. Pasting the output verbatim is
38 404s. Passing an explicit `name` makes both agree:

```ts
appleSplashScreens: createAppleSplashScreens({
  name: (landscape, size) =>
    `apple-splash-${landscape ? "landscape" : "portrait"}-${size.width}x${size.height}.png`,
}),
```

Verified: with this, all 38 hrefs resolve to files on disk.

**They would all be precached.** `injectManifest.globPatterns` in
`src/web/vite.config.ts` includes `**/*.png`, so Workbox would precache 592 KB
of iOS splash screens on Android and desktop too, taking the precache from about
15 KB of icons to about 660 KB. `globIgnores: ["apple-splash-*.png"]` keeps them
out; iOS fetches startup images from the network at install time, so nothing is
lost.

## How each commit is checked

- `mise run 2-check` before committing, per the convention in `AGENTS.md`.
- `scripts/deploy/smoke.ts:231` fetches every icon the manifest names. That is
  the real gate on commit 3 — a manifest that offers a size the build does not
  ship is invisible locally, because nothing loads a manifest icon until an
  install.
- `scripts/check/assets.ts` covers the 38 new top-level names in `dist/web` not
  shadowing a Worker route.

The working tree already carries unrelated changes to the Playwright config and
the e2e auth helpers. `AGENTS.md` records a commit where `git add -A` swept 196
unrelated lines into a message that described none of them, so each commit here
names its files explicitly.

## Deliberately not touched

`self.clients.claim()` in `src/web/sw.ts`. A static check calls it high-priority;
it is the manual `registerType: "autoUpdate"` that `injectManifest` requires, and
the comment above `VitePWA({…})` in `src/web/vite.config.ts` says so.

No CI wiring and no new dependencies. The tooling that produced the findings —
static manifest checks, PWABuilder's validator, `workbox-window`, Puppeteer
offline emulation, and the third-party push receiver that independently decrypted
what `src/api/webpush.ts` encrypted — is context for how the list was arrived at,
not part of it.

## Two open questions

1. **38 link tags hand-written into `src/web/index.html`, or `pwaAssets` wired
   into `VitePWA`?** The plugin can read `pwa-assets.config.ts` and inject both
   the head links and the manifest icons itself. That is less to rot, but it
   deletes the hand-maintained `icons` array that `src/web/vite.config.ts` keeps
   listed on purpose. Hand-written stays inside the scope that was asked for.
2. **`brand:icons` does not exist.** It is cited in `src/web/index.html` and in
   `src/web/vite.config.ts`; the task is `ops icons`. Fixing the two comments is
   a fifth commit, or nothing.
