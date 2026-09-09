import { useState } from "react"
import { Input } from "@/components/ui/input"
import { FieldDescription } from "@/components/ui/field"
import { useLocale } from "../lib/locale"
import { formatIsoDay, formatClockOn } from "../lib/dates"

/**
 * A date the reader can read back in their own language.
 *
 * `<input type="date">` renders its value in the **browser's** locale, not the
 * page's. Everything this app *displays* goes through `lib/dates.ts` and
 * `Intl.DateTimeFormat(tag(locale))` — the language the reader chose in the
 * switcher. So the app shows a Thai reader "15 ก.ย. 2026" and then asks them to
 * type it back as `09/15/2026`, because their laptop is en-US. Same field, two
 * calendars, and the ambiguous ones are the dates that matter: 05/09 is a
 * fixture in May or September depending on whose browser you are sitting at.
 *
 * This restates the chosen value underneath the control, in the reader's
 * language, so there is never a question about which one was entered.
 *
 * ## Why not the registry's Calendar
 *
 * It was the first answer, and it is the wrong one here on three counts, each
 * checked rather than assumed:
 *
 * 1. **`@shadcn/popover` depends on `radix-ui`.** This app is Base UI and only
 *    Base UI — `@base-ui/react` is the single headless dependency in
 *    package.json. A date picker is not a reason to run two of them.
 * 2. **`@shadcn/calendar` pulls `react-day-picker` and `date-fns`,** plus a
 *    locale bundle per language, onto a phone held at courtside.
 * 3. **The native control is better on that phone.** It is the OS wheel picker,
 *    it is already translated, already accessible, already familiar, and it
 *    costs nothing. Replacing it with a grid of buttons in a popover would be a
 *    downgrade on the device this app is mostly used on.
 *
 * So the native input stays and the ambiguity goes, which was the actual
 * defect. If a browsable month grid is ever wanted for its own sake, that is a
 * feature to decide on, not a fix to smuggle in here.
 */
export function DateField({
  withTime = false,
  value,
  defaultValue,
  onChange,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "type"> & {
  /** A moment rather than a day — `datetime-local` instead of `date`. */
  withTime?: boolean
  /** Declared, because the read back hangs its own testid off this one. */
  "data-testid"?: string
}) {
  const { locale } = useLocale()
  /**
   * Mirrored, because most callers are uncontrolled.
   *
   * Half these forms submit through `FormData` and pass only `name` and
   * `defaultValue`; the other half hold the value in state. Echoing the value
   * needs to read it either way, so the mirror follows `value` when there is
   * one and remembers what was typed when there is not.
   */
  const [typed, setTyped] = useState(String(defaultValue ?? ""))
  const current = value !== undefined ? String(value) : typed

  return (
    <>
      <Input
        type={withTime ? "datetime-local" : "date"}
        value={value}
        defaultValue={defaultValue}
        onChange={(e) => {
          setTyped(e.target.value)
          onChange?.(e)
        }}
        {...props}
      />
      {/* Nothing to echo before anything is chosen, and an empty line under
          every date field would be its own kind of noise. */}
      {readBack(locale, current, withTime) && (
        <FieldDescription
          // Off the testid rather than the id, because the testid is what a
          // spec already holds for the control this belongs to.
          data-testid={props["data-testid"] ? `${props["data-testid"]}-read-back` : undefined}
        >
          {readBack(locale, current, withTime)}
        </FieldDescription>
      )}
    </>
  )
}

/**
 * The value as the reader's language writes it, or "" if it is not a date yet.
 *
 * A half-typed `2026-1` is not an error to report — the reader is mid-keystroke
 * — so it echoes nothing until there is something true to say.
 */
function readBack(locale: string, value: string, withTime: boolean): string {
  if (!value) return ""
  const [day, time] = value.split("T")
  const shown = formatIsoDay(locale, day ?? null)
  if (!shown) return ""
  if (!withTime || !time) return shown
  const at = new Date(value)
  if (Number.isNaN(at.getTime())) return shown
  // The reader's own clock: these inputs are wall time where the fixture is,
  // which is the timezone the browser is already in.
  return `${shown} · ${formatClockOn(locale, at, null)}`
}
