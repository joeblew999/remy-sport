/**
 * Every released locale carries every message.
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
import { ALL_LOCALES, LOCALES } from "../src/domain/vocabularies"

const ROOT = resolve(import.meta.dir, "..")

const load = (locale: string): Record<string, string> | null => {
  try {
    return JSON.parse(readFileSync(resolve(ROOT, `messages/${locale}.json`), "utf8"))
  } catch {
    return null
  }
}

const keysOf = (m: Record<string, string>) => Object.keys(m).filter((k) => !k.startsWith("$"))

const base = load("en")
if (!base) {
  console.error("check-messages: messages/en.json is missing or unreadable")
  process.exit(1)
}
const expected = keysOf(base)
const problems: string[] = []

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

if (problems.length) {
  console.error(
    `check-messages: ${problems.length} problem(s):\n` + problems.map((p) => `  ${p}`).join("\n") +
      `\n\nA missing translation does not fail the paraglide build — it silently\n` +
      `renders English. That is why this check exists.`,
  )
  process.exit(1)
}
