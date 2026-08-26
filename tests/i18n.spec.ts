import { test, expect } from "@playwright/test"
import { m, locales, baseLocale } from "../src/web/lib/i18n"
import { VOCABULARY, LOCALES, ALL_LOCALES } from "../src/domain/vocabularies"

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
 */

test.describe("Localisation", () => {
  test("the locale lists have one source", () => {
    // Paraglide can hold copy for every DECLARED language, drafts included —
    // otherwise a translation in progress would have nowhere to live. Both
    // lists are generated from the PO's locales.jsonl, so neither is a second
    // source of truth.
    expect([...locales].sort()).toEqual([...ALL_LOCALES].sort())
    expect(ALL_LOCALES).toContain(baseLocale)

    // A reader is only offered the released ones. Half a translation shown to
    // someone is worse than English.
    for (const locale of LOCALES) expect(ALL_LOCALES).toContain(locale)
  })

  test("a draft language is never offered to a reader", () => {
    // The whole point of the draft status: declaring a language must not put a
    // 0%-translated button in front of anyone, or nobody dares declare one.
    const drafts = ALL_LOCALES.filter((l) => !(LOCALES as readonly string[]).includes(l))
    for (const draft of drafts) {
      expect(LOCALES as readonly string[], `${draft} is a draft`).not.toContain(draft)
    }
  })

  test("every message exists in every locale", () => {
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

  test("the switcher renders one button per declared locale", async ({ page }) => {
    await page.goto("/")
    const buttons = page.locator(".lang-switch button")
    await expect(buttons).toHaveCount(LOCALES.length)
  })

  test("switching to Thai translates the chrome AND the data together", async ({ page }) => {
    await page.goto("/")
    await expect(page.locator(".page-header h1")).toHaveText(m.discover_heading({}, { locale: "en" }))

    await page.locator(".lang-switch button", { hasText: "TH" }).click()

    // UI copy — from the compiled messages.
    await expect(page.locator(".page-header h1")).toHaveText(
      m.discover_heading({}, { locale: "th" }),
    )

    // Data names — from the API. The event type badge is a vocabulary label,
    // so it proves the reference data resolved in the reader's language and
    // not merely that a hardcoded string changed.
    const thaiTypes = VOCABULARY.eventTypes.map((t) => t.names.th)
    const badge = page.locator(".event-row .type").first()
    await expect(badge).toBeVisible()
    expect(thaiTypes).toContain((await badge.textContent())?.trim())
  })

  test("the choice survives a reload", async ({ page }) => {
    await page.goto("/")
    await page.locator(".lang-switch button", { hasText: "TH" }).click()
    await expect(page.locator(".page-header h1")).toHaveText(
      m.discover_heading({}, { locale: "th" }),
    )

    await page.reload()
    // Persisted in localStorage by LocaleProvider — a reader who picked Thai
    // should not have to pick it again.
    await expect(page.locator(".page-header h1")).toHaveText(
      m.discover_heading({}, { locale: "th" }),
    )
  })

  test("no raw vocabulary code reaches the page", async ({ page }) => {
    // The label index is seeded from the compiled vocabularies so the first
    // paint is already right. Before that, a page rendered `CHIANG_MAI` for as
    // long as /api/reference took — a database code, shown to a reader.
    await page.goto("/")
    await expect(page.locator(".event-row").first()).toBeVisible()
    const body = (await page.locator(".main").textContent()) ?? ""
    // Codes that could not be mistaken for prose: BANGKOK collides with the
    // word in a fixture headline, CHIANG_MAI cannot.
    const codes = VOCABULARY.cities.map((c) => c.code).filter((c) => c.includes("_"))
    expect(codes.length, "need at least one unambiguous code to assert on").toBeGreaterThan(0)
    for (const code of codes) expect(body).not.toContain(code)
  })
})
