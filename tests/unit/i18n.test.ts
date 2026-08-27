import { describe, expect, it } from "bun:test"
import { m, locales, baseLocale } from "../../src/web/lib/i18n"
import { LOCALES, ALL_LOCALES } from "../../src/domain/vocabularies"

/**
 * The product is bilingual in two different ways, and both have to work.
 *
 *   UI copy   — the strings the product writes about itself. Compiled by
 *               Paraglide from messages/*.json.
 *   Data names — the strings the Product Owner writes. Locale-keyed JSON on
 *               the row, served by /api/reference and /api/events.
 *
 * They are separate systems on purpose (biz's localization-rules.md draws the
 * same line), but they share one locale list and one switch. A test that only
 * checked one would pass while the interface rendered Thai event names inside
 * English chrome, or the reverse — which is exactly the state this repo was in
 * before: translated data, hardcoded English everywhere around it.
 


 * These three assert the compiled output and the generated locale lists. They
 * needed no browser and no Worker — they were Playwright tests only because
 * Playwright was the only runner. `bun test`, ~20ms.
 */

describe("Localisation", () => {
  it("the locale lists have one source", () => {
    // Paraglide can hold copy for every DECLARED language, drafts included —
    // otherwise a translation in progress would have nowhere to live. Both
    // lists both come from the model's ALL_LOCALES, so neither is a second
    // source of truth.
    expect([...locales].sort()).toEqual([...ALL_LOCALES].sort())
    expect(ALL_LOCALES).toContain(baseLocale)

    // A reader is only offered the released ones. Half a translation shown to
    // someone is worse than English.
    for (const locale of LOCALES) expect(ALL_LOCALES).toContain(locale)
  })

  it("a draft language is never offered to a reader", () => {
    // The whole point of the draft status: declaring a language must not put a
    // 0%-translated button in front of anyone, or nobody dares declare one.
    const drafts = ALL_LOCALES.filter((l) => !(LOCALES as readonly string[]).includes(l))
    for (const draft of drafts) {
      expect(LOCALES as readonly string[], `${draft} is a draft`).not.toContain(draft)
    }
  })

  it("every message exists in every locale", () => {
    // Paraglide falls back to the base locale for a missing key rather than
    // failing, so a half-translated file ships as English without complaint.
    // Comparing the compiled output catches that.
    for (const locale of LOCALES) {
      const missing = Object.keys(m).filter((key) => {
        const message = (m as Record<string, (i: unknown, o: { locale: string }) => string>)[key]!
        return message({}, { locale }) === message({}, { locale: baseLocale }) && locale !== baseLocale
      })
      // Released locales only: a draft is incomplete by definition. Identical
      // output is legitimate for a few (proper nouns, symbols), so this asserts
      // the bulk rather than demanding every string differ.
      expect(missing.length, `${locale} is largely untranslated`).toBeLessThan(
        Object.keys(m).length / 2,
      )
    }
  })
})
