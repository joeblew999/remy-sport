/**
 * Vendor the web fonts into src/web/fonts/, and write the @font-face CSS.
 *
 * The SPA used to <link> them from fonts.googleapis.com. Four reasons that was
 * wrong, only one of which is about tests:
 *
 *   - Tauri desktop and iOS ship this same bundle. A device with no connection
 *     rendered the app in a fallback font.
 *   - Google Fonts sends every visitor's IP to Google. This platform's users
 *     include minors.
 *   - Third-party DNS + TLS + round-trip sat on the critical render path, on
 *     mobile networks.
 *   - It cost ~2.5s per render test, which was that whole tier.
 *
 * Re-run after changing a family or a weight in styles.css. The output is
 * committed, so a build never reaches the network.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "fs"
import { join, resolve } from "path"
import { ALL_LOCALES } from "../../src/domain/vocabularies"

const ROOT = resolve(import.meta.dir, "../..")
const OUT = join(ROOT, "src/web/fonts")

/**
 * Which font a script needs, and which Google subsets carry it.
 *
 * **There is no single font that covers every language.** Unicode is too large;
 * a genuinely universal face is ~100MB. Google's Noto family ("NO TOfu") is the
 * closest thing and ships one file *per script* for exactly that reason.
 *
 * So the rule here is: self-host only what an OS cannot be relied on to have,
 * and let `system-ui` cover the rest.
 *
 *   Latin  — self-hosted. It is the brand (Inter, Space Grotesk, IBM Plex Mono).
 *   Thai   — self-hosted. Small (3 subsets, ~40KB) and system Thai faces by
 *            platform enough to be visible.
 *   CJK    — NOT self-hosted. Noto Sans JP alone is 366 @font-face blocks and
 *            5.3MB, and every device that reads Japanese already ships a better
 *            CJK face than we would send it. The font stack in styles.css falls
 *            through to system-ui.
 *
 * Keyed by locale so this follows the same rule as everything else here:
 * shipping a language is a change to the model's ALL_LOCALES plus
 * `mise run domain:sync`, not an edit to a list in this file. A declared
 * locale with no entry below is a hard failure, not silent tofu.
 *
 * `latin`/`latin-ext` are unconditional: names, codes and numerals appear in
 * every language, and a Thai school's roster carries accented Latin names.
 */
const SCRIPTS: Record<string, { subsets: string[]; family?: string }> = {
  en: { subsets: [] },
  th: { subsets: ["thai"], family: "Noto+Sans+Thai:wght@400;500;600" },
  vi: { subsets: ["vietnamese"] },
  ru: { subsets: ["cyrillic", "cyrillic-ext"] },
  el: { subsets: ["greek", "greek-ext"] },

  // CJK carries no `family` on purpose — see the note above. The subsets are
  // named so the keep-filter is honest about what is being relied on
  // elsewhere, but nothing is downloaded.
  ja: { subsets: [] },
  ko: { subsets: [] },
  zh: { subsets: [] },
}

const unknown = ALL_LOCALES.filter((l) => !(l in SCRIPTS))
if (unknown.length) {
  console.error(
    `fonts: no script mapping for locale(s) ${unknown.join(", ")}.\n` +
      `Add them to SCRIPTS in this file — a declared locale with no font renders\n` +
      `as empty boxes, and nothing else would have told you.`,
  )
  process.exit(1)
}

/** The UI families, plus one per declared script that needs its own. */
const FAMILIES = [
  "Space+Grotesk:wght@400;500;600;700",
  "Inter:wght@400;500;600",
  "IBM+Plex+Mono:wght@400;500;600",
  ...new Set(ALL_LOCALES.map((l) => SCRIPTS[l]!.family).filter(Boolean) as string[]),
]

// Google serves woff2 only to a UA it believes supports it.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"

const url = `https://fonts.googleapis.com/css2?${FAMILIES.map((f) => `family=${f}`).join("&")}&display=swap`

const full = await (await fetch(url, { headers: { "User-Agent": UA } })).text()

/**
 * Keep only the subsets this product can render.
 *
 * Google returns one @font-face per (family, weight, unicode-range) — 57 blocks
 * across four families, and most were Cyrillic, Greek and Vietnamese. The
 * product is English and Thai; those bytes could never be reached.
 *
 * The keep-list is DERIVED from the declared locales, so adding a language
 * upstream widens it automatically. Hardcoding it broke `ja` — already declared
 * as a draft — the moment it was written.
 */
const KEEP = [
  // Unconditional — every language renders names, codes and numerals.
  "latin",
  "latin-ext",
  ...new Set(ALL_LOCALES.flatMap((l) => SCRIPTS[l]!.subsets)),
]

const css = full
  .split(/(?=\/\* [a-z-]+ \*\/)/)
  .filter((block) => {
    const subset = block.match(/^\/\* ([a-z-]+) \*\//)?.[1]
    return !subset || KEEP.includes(subset)
  })
  .join("")

mkdirSync(OUT, { recursive: true })

const seen = new Map<string, string>()
let local = css

for (const m of css.matchAll(/https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2/g)) {
  const remote = m[0]
  if (!seen.has(remote)) {
    // gstatic paths are already content-addressed; keep the leaf name.
    const name = remote.split("/").slice(-2).join("-")
    // Content-addressed means the name IS the identity: a file already here has
    // the bytes this URL serves. Re-fetching cannot change it, and re-writing it
    // moves its mtime — which is the whole bug (see the note on fonts.css below;
    // these thirteen files sit under src/web too, so touching them made the
    // bundle stale just as surely). It also spares every command thirteen
    // round-trips to Google that only ever rewrote what was already on disk.
    if (!existsSync(join(OUT, name))) {
      const bytes = new Uint8Array(await (await fetch(remote)).arrayBuffer())
      writeFileSync(join(OUT, name), bytes)
      console.log(`  ${name}  ${(bytes.length / 1024) | 0}KB`)
    }
    seen.set(remote, name)
  }
  local = local.replaceAll(remote, `./fonts/${seen.get(remote)}`)
}

/**
 * Delete what this run did not vendor.
 *
 * Nothing used to, and because the names are content-addressed, changing a
 * family or a weight does not overwrite the old file — it writes a differently
 * named one beside it. The superseded bytes then stay in git forever, referenced
 * by no @font-face block and reachable from no page: dead weight that every
 * clone pays for and that reads, to anyone listing the directory, as a font the
 * product still uses.
 *
 * Guarded on a non-empty run because the whole set is derived from ONE network
 * fetch above. A blip that returned an empty stylesheet would otherwise be
 * indistinguishable from "no fonts are wanted", and this loop would delete all
 * thirteen.
 */
if (seen.size) {
  const wanted = new Set(seen.values())
  for (const file of readdirSync(OUT)) {
    if (wanted.has(file)) continue
    unlinkSync(join(OUT, file))
    console.log(`  removed ${file}  (no longer referenced)`)
  }
}

/**
 * Written only when the content actually changed.
 *
 * An unconditional write moves the mtime, and src/web is an input to the bundle
 * — so rewriting an identical file made the bundle look stale on every run and
 * rebuilt it every time. `vite build` empties dist/web before it writes, so each
 * needless rebuild opened a window where that directory was empty, and a
 * production deploy failed at the gate with 404 for `/` because the Worker's
 * [assets] binding read it during one.
 *
 * A generator that rewrites identical bytes is not idempotent, whatever its
 * output says.
 */
const cssPath = join(ROOT, "src/web/fonts.css")
const generated =
  `/* GENERATED by \`mise run 1-dev\` — do not edit.\n` +
  `   Locales: ${ALL_LOCALES.join(", ")}\n` +
  `   Families: ${FAMILIES.join(", ")} */\n\n${local}`

if (!existsSync(cssPath) || readFileSync(cssPath, "utf-8") !== generated) {
  writeFileSync(cssPath, generated)
  console.log(`\nfonts: ${seen.size} files, src/web/fonts.css written`)
} else {
  console.log(`\nfonts: ${seen.size} files, src/web/fonts.css unchanged`)
}
