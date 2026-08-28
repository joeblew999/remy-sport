import { defineConfig, minimal2023Preset } from "@vite-pwa/assets-generator/config"

/**
 * Which icons to cut from `src/web/public/brand.svg`, and nothing else.
 *
 * The preset is the whole configuration. A first version of this file also set
 * an opaque background on the apple and maskable icons to stop iOS drawing a
 * white ring behind a circular mark — the preset already does exactly that.
 * Checked by reading corner pixels rather than trusting the docs or myself:
 * `pwa-*` keep transparent corners, `apple-touch` and `maskable` come out
 * opaque `#dd5230`.
 *
 * It cannot be replaced by `--preset minimal2023` on the command line. That
 * flag parses and then fails with "Preset minimal2023 not yet implemented", so
 * this file is the only way to say it.
 *
 * No size list here on purpose: which sizes each OS wants changes with its
 * releases, and a list in this repo would be a snapshot of what was true the
 * day somebody wrote it. That is the preset's job, maintained upstream.
 */
export default defineConfig({
  preset: minimal2023Preset,
  // Written into src/web/public so vite copies them verbatim to the site root.
  // Under src/web they were treated as source and content-hashed into /assets,
  // and the manifest — which names them unhashed — 404'd on every one. That is
  // invisible locally, because nothing loads a manifest icon until an install.
  images: ["src/web/public/brand.svg"],
})
