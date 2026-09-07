/**
 * The manifest's screenshots, promoted from the screenshot walk.
 *
 * `bun run shots` photographs every screen in every language into
 * `screenshots/`, which is gitignored — that directory is a report, read once
 * and regenerated. Two of those pictures are also a *product* asset: the
 * manifest's `screenshots`, which is what `<pwa-install>`'s gallery shows a
 * reader deciding whether to install, and what Chromium's own richer install UI
 * asks for. So those two are committed, exactly as the icons are, because a
 * build must not depend on a walk that needs a seeded database and a running
 * Worker.
 *
 * `bun run ops screenshots` after a change worth re-photographing, then
 * `bun run check` — tests/repo/manifest.test.ts is what holds the manifest and
 * these files to the same story, including their dimensions.
 */
import { existsSync, readFileSync, writeFileSync } from "fs"
import { join, resolve } from "path"

const ROOT = resolve(import.meta.dirname, "../..")

/**
 * Which two screens make the case for installing, and why these.
 *
 * `discover` is what a stranger sees — the platform, with real events on it —
 * and it is the only screen that needs no session to explain itself. The narrow
 * one is a spectator's home, because a spectator with a phone is who installs
 * this: a parent following a score, not an organiser at a laptop.
 *
 * English, because a manifest has one set of screenshots and no way to vary
 * them by language. The reader's own dialog is translated (`th.xlf` upstream);
 * the pictures inside it are not, and cannot be.
 *
 * One `wide` and one `narrow` is a floor, not a preference: the component
 * filters the gallery by form factor, so a phone in portrait sees *only* the
 * narrow ones. Ship one form factor and half the readers open an empty gallery.
 */
const SHOTS = [
  { from: "screenshots/desktop/discover.en.png", to: "src/web/public/screenshot-wide.png" },
  { from: "screenshots/mobile/home-spectator.en.png", to: "src/web/public/screenshot-narrow.png" },
] as const

/** A PNG says its own size in the IHDR chunk, at a fixed offset. */
function dimensions(bytes: Buffer): string {
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`
}

const missing = SHOTS.filter((s) => !existsSync(join(ROOT, s.from))).map((s) => s.from)
if (missing.length) {
  console.error(
    `screenshots: the walk has not photographed ${missing.join(" or ")}.\n\n` +
      `  bun run shots\n\n` +
      `A slice of the walk (\`-g\`) leaves the rest of the last full run in place,\n` +
      `so this can be missing after photographing one screen. Run it whole.`,
  )
  process.exit(1)
}

let changed = 0
for (const shot of SHOTS) {
  const to = join(ROOT, shot.to)
  const bytes = readFileSync(join(ROOT, shot.from))
  /**
   * Written only when the bytes actually differ.
   *
   * These land under src/web, which is an input to the bundle, so rewriting an
   * identical file moves its mtime and makes the build look stale — the same
   * trap fonts.ts documents, and it costs a needless rebuild every run. The
   * walk re-photographs on every invocation, so identical bytes are the normal
   * case here, not the rare one.
   */
  const same = existsSync(to) && readFileSync(to).equals(bytes)
  if (!same) {
    writeFileSync(to, bytes)
    changed++
  }
  console.log(
    `  ${shot.to}  ${dimensions(bytes)}  ${(bytes.length / 1024) | 0}KB  ${same ? "unchanged" : "written"}`,
  )
}

console.log(
  changed
    ? `\nscreenshots: ${changed} of ${SHOTS.length} updated — check the sizes above against` +
        ` the manifest in src/web/vite.config.ts, then \`bun run check\`.`
    : `\nscreenshots: ${SHOTS.length} already current.`,
)
