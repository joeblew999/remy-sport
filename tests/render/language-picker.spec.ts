import { test, expect } from "./fixture"
import { as } from "../helpers/actors"
import { visit } from "../helpers/surfaces"

/**
 * The picker, at the count it is about to face.
 *
 * The Product Owner is adding ten to fifteen languages. The control was a
 * `ToggleGroup` of two-letter codes, which is right for three and wrong for
 * fifteen — `PT` beside `PL`, `FA` beside `FI`, wrapping over four lines, and
 * the name a reader actually scans for never shown.
 *
 * These hold the two things that decide whether it survives the growth: the
 * options are named in their own language, and the row does not grow with the
 * list. The second is the one that could not be caught by looking, because
 * today there are three. docs/done/2026-09-09-15-language-picker-at-fifteen.md.
 */
test.describe("The language picker", () => {
  test("names each language in its own words, not by code", async ({ page }) => {
    await as(page, "ADMIN")
    await visit(page, "discover")

    // The trigger is where somebody who cannot read the interface looks to see
    // what it is set to, so it says the language rather than "en".
    await expect(page.getByTestId("lang-switch")).toContainText("English")

    await page.getByTestId("lang-switch").click()
    await expect(page.getByTestId("lang-th")).toHaveText("ไทย")
    await expect(page.getByTestId("lang-ja")).toHaveText("日本語")
    await expect(page.getByTestId("lang-en")).toHaveText("English")
  })

  test("the row does not grow with the number of languages", async ({ page }) => {
    await as(page, "ADMIN")
    await visit(page, "discover")

    /**
     * A closed Select is one row whatever the list holds — that is the whole
     * reason it replaced the ToggleGroup, whose height was a function of the
     * option count. Measured rather than asserted from the markup: the failure
     * this guards against is visual.
     */
    const box = await page.getByTestId("lang-switch").boundingBox()
    expect(box!.height, "a closed picker is one control, not a wrapped grid").toBeLessThan(48)

    // And it stays inside the sidebar rather than pushing it wider.
    const sidebar = await page.locator('[data-slot="sidebar"]').first().boundingBox()
    expect(box!.x + box!.width).toBeLessThanOrEqual(sidebar!.x + sidebar!.width + 1)
  })

  test("choosing one changes the language of the page", async ({ page }) => {
    await as(page, "ADMIN")
    await visit(page, "discover")
    await page.getByTestId("lang-switch").click()
    await page.getByTestId("lang-th").click()
    await expect(page.getByTestId("lang-switch")).toContainText("ไทย")
    // The heading is the app's, not the picker's — the switch reached the page.
    await expect(page.getByRole("heading", { level: 1 })).not.toContainText("What's on the court")
  })
})
