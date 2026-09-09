/**
 * Every released locale carries every message.
 *
 * TEMPORARY — delete this file when inlang ships validation rules.
 *
 * Paraglide v2 removed lint rules outright, `@inlang/message-lint-rule-missing-
 * translation` among them, and removed `inlang lint` from the CLI. The v2
 * changelog says they are to come back as lix validation rules and points at
 * https://github.com/opral/lix/issues/239, which is open. So the tool that used
 * to answer this question upstream does not currently exist, and this file is
 * standing in for it rather than being a thing we decided to own. When that
 * issue closes, check whether a rule covers the first half of this file and
 * delete it if so — the ERRORS check at the bottom is ours and stays.
 *
 * Paraglide compiles messages into functions, so a *missing key* is a compile
 * error — `m.nope()` does not exist. A missing *translation* is not: the
 * compiler emits `if (locale === "th") return th_x(...)` and falls through to
 * English, and the build passes. Verified by deleting a key and running
 * `mise run i18n:generate`, which succeeded.
 *
 * So a Thai reader gets English for that one string and nothing says so. That is
 * the same failure the model's own check exists to prevent — `domain/check.ts`
 * in remy-sport-biz, which covers the PO's 247 values — and the UI's 113 had no
 * equivalent.
 *
 * `ALL_LOCALES` versus `LOCALES` is the model's distinction and is honoured
 * here: `ja` is declared and deliberately not offered, so it is reported as a
 * draft rather than as 113 failures.
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import * as vocabularies from "../../src/domain/vocabularies"
import { ALL_LOCALES, LOCALE, LOCALES } from "../../src/domain/vocabularies"
import { ERRORS } from "../../src/api/errors"
import { rule } from "./helpers"

const ROOT = resolve(import.meta.dirname, "../..")

const load = (locale: string): Record<string, string> | null => {
  try {
    return JSON.parse(readFileSync(resolve(ROOT, `messages/${locale}.json`), "utf8"))
  } catch {
    return null
  }
}

const keysOf = (m: Record<string, string>) => Object.keys(m).filter((k) => !k.startsWith("$"))

const base = load("en")
const problems: string[] = base ? [] : ["en: messages/en.json is missing or unreadable"]
const expected = keysOf(base ?? {})

for (const locale of LOCALES) {
  const messages = load(locale)
  if (!messages) {
    problems.push(`${locale}: messages/${locale}.json does not exist, but ${locale} is released`)
    continue
  }
  const have = new Set(keysOf(messages))

  const missing = expected.filter((k) => !have.has(k))
  // An untranslated string is as bad as an absent one and harder to notice: it
  // renders, it just renders in the wrong language.
  const untranslated = expected.filter((k) => have.has(k) && !messages[k]?.trim())
  // A key nothing else has is a rename that only landed in one file.
  const extra = [...have].filter((k) => !expected.includes(k))

  for (const k of missing.slice(0, 5)) problems.push(`${locale}: ${k} is missing`)
  if (missing.length > 5) problems.push(`${locale}: ...and ${missing.length - 5} more missing`)
  for (const k of untranslated.slice(0, 5)) problems.push(`${locale}: ${k} is empty`)
  for (const k of extra.slice(0, 5)) problems.push(`${locale}: ${k} exists here but not in en`)

  if (!missing.length && !untranslated.length && !extra.length) {
    console.log(`check-messages: '${locale}' — ${expected.length}/${expected.length} translated`)
  }
}

for (const locale of ALL_LOCALES) {
  if ((LOCALES as readonly string[]).includes(locale)) continue
  // Declared but not offered. The switcher never shows it, so an incomplete
  // file is intent rather than a defect.
  const n = keysOf(load(locale) ?? {}).length
  console.log(`check-messages: '${locale}' — draft, not offered (${n}/${expected.length})`)
}

/**
 * Every error code the API can throw has a sentence to render.
 *
 * `src/web/lib/form-errors.ts` looks a code up by convention — TEAM_PLAYS_ITSELF
 * reads `err_team_plays_itself` — rather than through a hand-written table. That
 * removed a fourth file to edit per error and a second copy of the English, and
 * it gave up a compile-time guarantee. This is that guarantee, moved here.
 *
 * A code with no message renders the code itself to a person: "TEAM_PLAYS_ITSELF"
 * in an error box. That must not ship.
 */
for (const code of Object.keys(ERRORS)) {
  const key = `err_${code.toLowerCase()}`
  if (!expected.includes(key)) {
    problems.push(`en: ${key} is missing — src/api/errors.ts can throw ${code}`)
  }
}

/**
 * The HTTP-level codes too, which are not in ERRORS.
 *
 * A raw `new ORPCError("NOT_FOUND", …)` never goes through `.errors()`, so it
 * carries no entry in the table above — but the client still renders it by
 * code, because rendering the Worker's own `message` is how English reached a
 * Thai reader. Every code the Worker actually throws is listed here; a new one
 * added to src/api without a message would put the bare code on screen.
 *
 * Kept as a literal list rather than grepped out of src/: a grep would silently
 * find nothing the day the throw site is written differently, and report
 * success. This is short, and a missing entry is caught by the test in
 * tests/unit/form-errors.test.ts as well.
 */
const THROWN_CODES = ["NOT_FOUND", "FORBIDDEN", "UNAUTHORIZED", "BAD_REQUEST", "INTERNAL_SERVER_ERROR"]
for (const code of THROWN_CODES) {
  const key = `err_${code.toLowerCase()}`
  if (!expected.includes(key)) {
    problems.push(`en: ${key} is missing — the Worker can throw a bare ${code}`)
  }
}

rule(
  "every released locale carries every message",
  problems,
  `check-messages: ${problems.length} problem(s):\n` +
    problems.map((p) => `  ${p}`).join("\n") +
    `\n\nA missing translation does not fail the paraglide build — it silently\n` +
    `renders English. That is why this check exists.`,
)

/**
 * Every declared language names itself.
 *
 * The picker shows `endonym` — the language in its own words — because somebody
 * who cannot read the current interface still has to find theirs, and because
 * the older `names` shape is N×N: nine strings at three languages, two hundred
 * and twenty-five at fifteen, with every addition editing all the existing
 * entries.
 *
 * So a language added without one would fall back to its two-letter code in the
 * one control whose whole job is to be readable by somebody who is lost. This
 * is the check that stops that arriving with the tenth language rather than the
 * fourth. docs/done/2026-09-09-15-language-picker-at-fifteen.md.
 */
const nameless = LOCALE.filter((l) => !("endonym" in l) || !String((l as { endonym?: string }).endonym ?? "").trim())
  .map((l) => l.code)
rule(
  "every declared language names itself in its own words",
  nameless,
  `check-messages: ${nameless.length} locale(s) with no endonym: ${nameless.join(", ")}\n\n` +
    `Add it to LOCALE in the model — the language's own name for itself, written once.\n` +
    `Without it the picker falls back to the two-letter code, which is what it is\n` +
    `there to replace.`,
  `check-messages: ${LOCALE.length} declared locale(s), each naming itself`,
)

/**
 * No right-to-left language ships before the layout can handle one.
 *
 * All thirteen released locales read left to right, so nothing in this app has
 * ever been asked to mirror — and every sidebar, drawer, breadcrumb and chevron
 * quietly assumes a direction. Arabic is on the plan's own list; Hebrew, Farsi
 * and Urdu are the same shape.
 *
 * This is not a font problem, which is what makes it worth a check of its own:
 * `ops fonts` would happily fetch an Arabic subset and the text would render
 * perfectly, in the wrong place, beside controls pointing the wrong way. Nothing
 * would fail. The reader would just get a page that looks broken.
 *
 * So the model declares `direction`, and releasing an "rtl" locale requires the
 * registry's `direction` item to be installed — the item that makes the
 * primitives direction-aware, and the moment somebody has to look at the layout.
 * docs/done/2026-09-09-15-language-picker-at-fifteen.md, step 5.
 */
const RTL_ITEM = "@shadcn/direction"
const lock = JSON.parse(readFileSync(resolve(ROOT, "components-lock.json"), "utf8")) as {
  items?: Record<string, unknown>
}
const rtlReady = RTL_ITEM in (lock.items ?? {})
const rtlReleased = LOCALE.filter(
  (l) => (l as { direction?: string }).direction === "rtl" && l.status === "released",
).map((l) => l.code)
const blocked = rtlReady ? [] : rtlReleased
rule(
  "no right-to-left language is released before the layout can handle one",
  blocked,
  `check-messages: ${blocked.length} right-to-left locale(s) released with no direction support: ${blocked.join(", ")}\n\n` +
    `Run \`bun run ops ui add direction\` and check the layout before releasing one.\n` +
    `The text will render either way — it is the sidebar, breadcrumbs and chevrons\n` +
    `that will be pointing the wrong way, and nothing else would fail.`,
  rtlReady
    ? `check-messages: direction installed, right-to-left locales may be released`
    : `check-messages: no right-to-left locale released (direction not installed yet)`,
)

/**
 * No language contains a character from a script it does not use.
 *
 * Written after shipping `Mùa giải定 kỳ` in Vietnamese. One CJK character in the
 * middle of a Latin word, typed by accident and reviewed by eye, past a
 * completeness check that only counts keys and a placeholder check that only
 * reads `{braces}`. Everything green.
 *
 * It is a worse defect than a missing translation, because a missing one falls
 * back to English and still reads. This renders a tofu box mid-word for every
 * reader of that language — and it is the exact failure the whole self-hosted
 * font pipeline exists to prevent, arriving through the copy instead of through
 * the font.
 *
 * The rule is per-locale and deliberately narrow: only scripts a locale is
 * expected to write in are allowed, and the check names the offending character
 * rather than the range, so the fix is visible from the failure.
 *
 * Latin, digits and punctuation are allowed everywhere — every language here
 * carries names, codes and numerals, which is the same reason `latin` and
 * `latin-ext` are unconditional in `ops fonts`.
 */
const BLOCKS: [string, RegExp][] = [
  ["Thai", /[฀-๿]/u],
  ["Cyrillic", /[Ѐ-ӿԀ-ԯ]/u],
  ["Greek", /[Ͱ-Ͽ]/u],
  ["Arabic", /[؀-ۿ]/u],
  /**
   * U+0964 and U+0965 are cut out of Devanagari deliberately.
   *
   * The danda `।` and double danda `॥` live in the Devanagari block because
   * that is where Unicode put them, but they are **shared Indic punctuation**:
   * Bengali, Punjabi, Odia and Gujarati all end a sentence with the same mark.
   * Treating the block as the script flagged 192 perfectly correct Bengali
   * strings and would have pushed the copy towards a full stop it does not use.
   *
   * A block is not a script. This is the only place the two come apart in the
   * languages shipped so far; the rest of the ranges are safe as written.
   */
  ["Devanagari", /[ऀ-ॣ०-ॿ]/u],
  ["Hiragana", /[぀-ゟ]/u],
  ["Katakana", /[゠-ヿ]/u],
  ["Hangul", /[가-힯ᄀ-ᇿ]/u],
  ["Han", /[一-鿿㐀-䶿]/u],
]

/**
 * What each language actually writes in. Everything absent here is Latin-only.
 *
 * A locale missing from this map is treated as Latin-only, so declaring a new
 * non-Latin language fails this check until it is listed. That is deliberate:
 * failing closed means the question "which scripts does this language use?" is
 * answered by a person once, rather than inferred — and an unlisted language is
 * loud rather than silently exempt. Ukrainian arrived and produced 826 failures
 * in one run, which is exactly the intended noise.
 */
const WRITES_IN: Record<string, string[]> = {
  th: ["Thai"],
  ja: ["Hiragana", "Katakana", "Han"],
  zh: ["Han"],
  ko: ["Hangul", "Han"],
  ru: ["Cyrillic"],
  uk: ["Cyrillic"],
  el: ["Greek"],
  hi: ["Devanagari"],
  ar: ["Arabic"],
  ur: ["Arabic"],
  fa: ["Arabic"],
  bn: ["Bengali"],
  "zh-TW": ["Han"],
  "zh-HK": ["Han"],
}

/** Every translated string the product ships, as (locale, where, text). */
function* translations(): Generator<[string, string, string]> {
  for (const locale of ALL_LOCALES) {
    for (const [key, text] of Object.entries(load(locale) ?? {})) {
      if (!key.startsWith("$") && typeof text === "string") yield [locale, `messages/${locale}.json ${key}`, text]
    }
  }
  for (const [name, entries] of Object.entries(vocabularies)) {
    if (!Array.isArray(entries)) continue
    // `vocabularies` exports rows *and* the derived code arrays — PROVINCE_CODES
    // is a `string[]`, which is why this cannot claim to be an array of objects.
    // The guard below is what makes it one; the type has to admit that first.
    for (const row of entries as readonly unknown[]) {
      if (!row || typeof row !== "object") continue
      const entry = row as Record<string, unknown>
      for (const field of ["names", "descriptions"] as const) {
        const byLocale = entry[field]
        if (!byLocale || typeof byLocale !== "object") continue
        for (const [locale, text] of Object.entries(byLocale as Record<string, unknown>)) {
          if (typeof text === "string") yield [locale, `${name}.${String(entry.code)}.${field}`, text]
        }
      }
    }
  }
}

const strays: string[] = []
for (const [locale, where, text] of translations()) {
  // The endonym is the one string that is deliberately in its own script while
  // sitting under every other locale's key: `ja`'s name for itself is 日本語 in
  // the English column too, which is the whole point of the picker.
  if (where.startsWith("LOCALE.")) continue
  const allowed = WRITES_IN[locale] ?? []
  for (const [script, pattern] of BLOCKS) {
    if (allowed.includes(script)) continue
    const found = text.match(pattern)
    if (!found) continue
    strays.push(`${locale}: ${where} — ${script} character ${JSON.stringify(found[0])} in "${text.slice(0, 60)}"`)
    break
  }
}

rule(
  "no language contains a character from a script it does not use",
  strays,
  `check-messages: ${strays.length} stray character(s):\n` +
    strays.map((s) => `  ${s}`).join("\n") +
    `\n\nA character from another script renders as a tofu box mid-word — the font\n` +
    `pipeline only ships the subsets a language declares. Usually a typo or a\n` +
    `line copied from the wrong column.`,
  `check-messages: no stray scripts across ${ALL_LOCALES.length} declared locale(s)`,
)
