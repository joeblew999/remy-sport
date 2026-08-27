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
import { ALL_LOCALES, LOCALES } from "../src/domain/vocabularies"
import { ERRORS } from "../src/api/errors"

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

if (problems.length) {
  console.error(
    `check-messages: ${problems.length} problem(s):\n` + problems.map((p) => `  ${p}`).join("\n") +
      `\n\nA missing translation does not fail the paraglide build — it silently\n` +
      `renders English. That is why this check exists.`,
  )
  process.exit(1)
}
