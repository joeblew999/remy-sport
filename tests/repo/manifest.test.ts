/**
 * The manifest must describe files that exist, at the size it claims.
 *
 * Every failure here is silent in a browser. An icon or screenshot whose `src`
 * 404s is skipped without a console error; one whose `sizes` disagrees with the
 * actual pixels is skipped the same way — and nothing loads a manifest asset
 * until someone tries to install, so a local run never notices. That is exactly
 * how the icons broke once already: written under `src/web` they were treated
 * as source and content-hashed into `/assets`, while the manifest named them
 * unhashed, and every one 404'd (see the note in pwa-assets.config.ts).
 *
 * Read off the built manifest rather than the vite config that writes it,
 * because what ships is the thing with the bug.
 *
 * `id` is checked too. Without it the browser identifies the installed app by
 * `start_url`, and `<pwa-install>` 0.7.0 needs it for the Web Install API path.
 */

import { existsSync, readFileSync, statSync } from "node:fs"
import { resolve, join } from "node:path"
import { rule } from "./helpers"

const ROOT = resolve(import.meta.dirname, "../..")
const DIST = resolve(ROOT, "dist/client")
const MANIFEST = join(DIST, "manifest.webmanifest")

// `bun run check` builds before it tests, but a bare `vitest run` does not —
// say so rather than passing on an absence, which would read as "the manifest
// is fine".
const skipped = !existsSync(MANIFEST)
  ? "dist/client/manifest.webmanifest is not built — run 'bun run build' to check for real"
  : null

type Asset = { src: string; sizes?: string; type?: string; form_factor?: string }
const manifest: { id?: string; icons?: Asset[]; screenshots?: Asset[] } = skipped
  ? {}
  : JSON.parse(readFileSync(MANIFEST, "utf8"))

const icons = manifest.icons ?? []
const screenshots = manifest.screenshots ?? []
const assets = [...icons.map((a) => ["icon", a] as const), ...screenshots.map((a) => ["screenshot", a] as const)]

/** A PNG says its own size in the IHDR chunk, at a fixed offset. */
function dimensions(file: string): string {
  const fd = readFileSync(file)
  return `${fd.readUInt32BE(16)}x${fd.readUInt32BE(20)}`
}

const wrong = skipped
  ? []
  : assets.flatMap(([kind, asset]) => {
      // The manifest sits at the site root, so a bare `src` resolves there.
      const file = join(DIST, asset.src)
      if (!existsSync(file) || !statSync(file).isFile())
        return [`${kind} ${asset.src} — named by the manifest, not in dist/client`]
      if (!asset.sizes) return [`${kind} ${asset.src} — no "sizes", so a browser cannot pick it`]
      const actual = dimensions(file)
      return actual === asset.sizes
        ? []
        : [`${kind} ${asset.src} — manifest says ${asset.sizes}, the file is ${actual}`]
    })

rule(
  "every icon and screenshot the manifest names exists, at the size it claims",
  wrong,
  `The web manifest describes assets that are missing or misdescribed:\n\n` +
    wrong.map((w) => `  ${w}`).join("\n") +
    `\n\nA browser skips these in silence — no console error, and nothing loads a\n` +
    `manifest asset until an install is attempted. Regenerate them:\n\n` +
    `  bun run ops icons          # from src/web/public/brand.svg\n` +
    `  bun run ops screenshots    # from the last \`bun run shots\` walk\n\n` +
    `then correct the sizes listed in the VitePWA manifest in src/web/vite.config.ts.`,
  skipped ?? `manifest: ${icons.length} icons, ${screenshots.length} screenshots, all present at the stated size`,
)

/**
 * Both form factors, because the install dialog filters on them.
 *
 * `<pwa-install>`'s gallery shows only the entries matching the reader's own
 * form factor — `narrow` for a phone in portrait, `wide` otherwise. Shipping
 * one kind gives half the readers a gallery button that opens nothing, which
 * looks like a broken dialog rather than a missing picture.
 */
const factors = new Set(screenshots.map((s) => s.form_factor))
const missingFactors = skipped ? [] : ["wide", "narrow"].filter((f) => !factors.has(f))

rule(
  "the manifest ships a screenshot for both form factors",
  missingFactors,
  `The manifest has no ${missingFactors.join(" or ")} screenshot.\n\n` +
    `<pwa-install> filters its gallery by the reader's form factor, so a missing\n` +
    `one is an empty gallery for everybody on that kind of device. Add it to\n` +
    `SHOTS in scripts/ops/screenshots.ts and to the manifest in\n` +
    `src/web/vite.config.ts.`,
  skipped ?? `manifest: screenshots for ${[...factors].sort().join(" and ")}`,
)

rule(
  "the manifest declares an id, so the app's identity is not its start_url",
  skipped || manifest.id ? [] : ["no id"],
  `The web manifest has no \`id\`.\n\n` +
    `Without one the browser identifies the installed app by \`start_url\` — so\n` +
    `changing that route orphans every existing install and offers a second copy\n` +
    `of the app. <pwa-install> 0.7.0 also needs it for the Web Install API path.\n\n` +
    `Set \`id\` in the VitePWA manifest in src/web/vite.config.ts.`,
  skipped ?? `manifest: id is ${JSON.stringify(manifest.id)}`,
)
