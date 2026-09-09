import { test, expect } from "./fixture"
import { switchLanguage, visit } from "../helpers/surfaces"
import { seedCache, entry, orpc } from "../helpers/seed-cache"
import { m } from "../../src/web/lib/i18n"
import { VOCABULARY, LOCALES } from "../../src/domain/vocabularies"
import { VOCABULARY as REF } from "../../src/domain/vocabularies"
import { apiReference } from "../helpers/api-fixtures"
import { projectEvent } from "../helpers/projections"

/**
 * The bilingual chrome, rendered — with the events handed straight to the cache.
 *
 * The product is bilingual in two different ways and both have to work: UI copy
 * compiled by Paraglide, and data names the PO writes as locale-keyed JSON on
 * the row. They are separate systems (biz's localization-rules.md draws the same
 * line) sharing one locale list and one switch. A test that checked only one
 * would pass while Thai event names sat inside English chrome.
 *
 * None of that needs a backend. These used to seed D1 and wait on /api/events
 * for an assertion about what a `<h1>` says.
 *
 * The three list/compile assertions that came with them moved further still —
 * tests/unit/i18n.test.ts, where they run in Node with no browser at all.
 */

/**
 * The league, which is genuinely bilingual — this file asserts Thai rendering,
 * so it needs an event with a Thai name, and inventing one proved only that the
 * fixture could hold two strings.
 */
const event = projectEvent("evt_002")

/**
 * Events AND the reference vocabularies.
 *
 * The event-type badge is a vocabulary label, so the Thai assertion needs the
 * reference payload as well — that is the whole point of it: it proves the
 * PO's data resolved in the reader's language, not that a hardcoded string
 * changed. Seeding both is what lets the pair travel together without a server.
 */
const seeded = (page: Parameters<typeof seedCache>[0]) =>
  seedCache(page, [
    entry(orpc.events.list, undefined, { events: [event] }),
    entry(orpc.reference.list, undefined, apiReference(REF)),
  ])

test.describe("Localisation, rendered", () => {
  test("the switcher offers one button per released locale", async ({ page }) => {
    await seeded(page)
    await visit(page, "discover")
    // The switcher is the ToggleGroup in the sidebar's Settings group (B2
    // step 8); the sidebar is open at this test's desktop width.
    // The options live in the menu now, not in the row — a closed Select is one
    // control whatever the list holds, which is the point of the change.
    await page.getByTestId("lang-switch").click()
    await expect(page.getByRole("option")).toHaveCount(LOCALES.length)
    await page.keyboard.press("Escape")
  })

  test("switching to Thai translates the chrome AND the data together", async ({ page }) => {
    await seeded(page)
    await visit(page, "discover")
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(m.discover_heading({}, { locale: "en" }))

    await switchLanguage(page, "th")

    // UI copy — from the compiled messages.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(m.discover_heading({}, { locale: "th" }))

    // Data names — the event type badge is a vocabulary label, so it proves the
    // reference data resolved in the reader's language rather than a hardcoded
    // string changing.
    const thaiTypes = VOCABULARY.eventTypes.map((t) => t.names.th)
    const badge = page.getByTestId("event-type").first()
    await expect(badge).toBeVisible()
    expect(thaiTypes).toContain((await badge.textContent())?.trim())
  })

  test("the choice survives a reload", async ({ page }) => {
    await seeded(page)
    await visit(page, "discover")
    await switchLanguage(page, "th")
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(m.discover_heading({}, { locale: "th" }))

    await page.reload()
    // Persisted in localStorage by LocaleProvider — a reader who picked Thai
    // should not have to pick it again.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(m.discover_heading({}, { locale: "th" }))
  })

  test("no raw vocabulary code reaches the page", async ({ page }) => {
    // The label index is seeded from the compiled vocabularies so the first
    // paint is already right. Before that, a page rendered `CHIANG_MAI` for as
    // long as /api/reference took — a database code, shown to a reader.
    await seeded(page)
    await visit(page, "discover")
    await expect(page.getByTestId("event-row").first()).toBeVisible()
    const body = (await page.locator("main").textContent()) ?? ""
    // Codes that could not be mistaken for prose: BANGKOK collides with the
    // word in a headline, CHIANG_MAI cannot.
    const codes = VOCABULARY.cities.map((c) => c.code).filter((c) => c.includes("_"))
    expect(codes.length, "need at least one unambiguous code to assert on").toBeGreaterThan(0)
    for (const code of codes) expect(body).not.toContain(code)
  })
})

/**
 * `<html lang>` matches the language on screen, from the first paint.
 *
 * index.html ships `lang="en"` and `setLocale` was the only thing that ever
 * wrote the attribute, so a Thai-preferring visitor read Thai content under
 * `lang="en"` for their whole first session — and forever if they never opened
 * the switcher. `initialLocale()` had already resolved the right answer; nothing
 * told the document.
 *
 * These assert BEFORE any interaction, which is the only place the bug lived:
 * clicking the switcher always set it correctly, so any test that switched
 * first would have passed on the broken code.
 *
 * Nothing on screen changes, which is why it survived — no CSS here keys off
 * `:lang()`. A screen reader picks its voice from this attribute and a crawler
 * indexes the page's language by it, and both read it on load.
 */
test.describe("the document's language attribute", () => {
  for (const locale of LOCALES) {
    test(`is '${locale}' on first load when that is the reader's language`, async ({ page }) => {
      await seedCache(page, [entry(orpc.events.list, undefined, { events: [event] })])
      await page.addInitScript((l) => localStorage.setItem("remy.locale", l), locale)

      await visit(page, "discover")
      await expect(page.locator("html")).toHaveAttribute("lang", locale)
    })
  }

  test("follows the switcher afterwards", async ({ page }) => {
    await seedCache(page, [entry(orpc.events.list, undefined, { events: [event] })])
    await page.addInitScript(() => localStorage.setItem("remy.locale", "en"))

    await visit(page, "discover")
    await expect(page.locator("html")).toHaveAttribute("lang", "en")

    await switchLanguage(page, "th")
    await expect(page.locator("html")).toHaveAttribute("lang", "th")
  })
})
