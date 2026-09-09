import { test, expect } from "./fixture"
import { sessionFor } from "../helpers/actors"
import { visit } from "../helpers/surfaces"
import { seedCache, entry, orpc } from "../helpers/seed-cache"
import { formatIsoDay } from "../../src/web/lib/dates"
import { projectMyPlayers } from "../helpers/projections"

/**
 * A date reads back in the reader's language, whatever the browser is set to.
 *
 * `<input type="date">` renders its value in the **browser's** locale — not the
 * page's, not `<html lang>`, and not the language the reader picked in the
 * switcher. Everything this app *displays* goes the other way, through
 * `lib/dates.ts` and `Intl.DateTimeFormat(tag(locale))`. So the app showed a
 * Thai reader "15 ก.ย. 2026" and then asked them to type it back into a control
 * their laptop was drawing as `09/15/2026`.
 *
 * That is not cosmetic on these particular fields. A date of birth decides
 * age-group eligibility, and a fixture time is where somebody turns up. 05/09
 * and 09/05 are four months apart and both are valid.
 *
 * `DateField` keeps the native control — it is the OS picker on the phone this
 * app is used on, already translated and already accessible — and states the
 * chosen value underneath in the reader's own language. This asserts the part a
 * person would check by looking.
 *
 * Why not the registry's Calendar is in src/web/components/date-field.tsx: it
 * would put `radix-ui` beside Base UI in an app that deliberately runs one
 * headless library, for a control the OS already draws better.
 */

const signedIn = sessionFor("SPECTATOR")

/**
 * A guardian with no children yet, which is the shortest road to the form.
 *
 * `usr_spectator_001` is the seeded person `sessionFor("SPECTATOR")` signs in
 * as, and the projection is asked for THEIR players so the two cannot drift.
 */
const seed = (page: Parameters<typeof seedCache>[0]) =>
  seedCache(page, [
    signedIn,
    entry(orpc.players.mine, undefined, { ...projectMyPlayers("usr_spectator_001"), players: [] }),
  ])

/** A date whose reading is genuinely ambiguous between locales. */
const AMBIGUOUS = "2012-05-09"

const openAddPlayer = async (page: Parameters<typeof seed>[0]) => {
  await visit(page, "dashboard")
  await page.getByTestId("add-player").click()
  await expect(page.getByTestId("add-player-form")).toBeVisible()
}

test.describe("A chosen date, read back", () => {
  test("says nothing until there is something true to say", async ({ page }) => {
    await seed(page)
    await openAddPlayer(page)

    // An empty line under every date field is its own kind of noise, and a
    // half-typed value is not an error to report at somebody mid-keystroke.
    await expect(page.getByTestId("add-player-dob-read-back")).toHaveCount(0)
  })

  test("restates the date in English for an English reader", async ({ page }) => {
    await seed(page)
    await openAddPlayer(page)
    await page.getByTestId("add-player-dob").fill(AMBIGUOUS)

    await expect(page.getByTestId("add-player-dob-read-back")).toHaveText(
      formatIsoDay("en", AMBIGUOUS),
    )
  })

  test("restates the same date in Thai for a Thai reader", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("remy.locale", "th"))
    await seed(page)
    await openAddPlayer(page)
    await page.getByTestId("add-player-dob").fill(AMBIGUOUS)

    const thai = formatIsoDay("th", AMBIGUOUS)
    await expect(page.getByTestId("add-player-dob-read-back")).toHaveText(thai)
    // The premise of the whole component: these two are not the same string, so
    // a reader who gets the wrong one can tell.
    expect(thai, "if Thai and English render alike, this test proves nothing").not.toBe(
      formatIsoDay("en", AMBIGUOUS),
    )
  })

  test("leaves the native control exactly as it was", async ({ page }) => {
    await seed(page)
    await openAddPlayer(page)

    // The point is an addition, not a replacement: the OS picker, the `.fill()`
    // every other spec does, and the YYYY-MM-DD the API wants all still hold.
    const input = page.getByTestId("add-player-dob")
    await expect(input).toHaveAttribute("type", "date")
    await input.fill(AMBIGUOUS)
    await expect(input).toHaveValue(AMBIGUOUS)
  })
})
