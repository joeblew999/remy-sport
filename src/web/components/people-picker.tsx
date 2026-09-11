import { m } from "../lib/i18n"
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
} from "@/components/ui/combobox"

/** Id and name is all a picker needs, and all the people endpoints return. */
export interface Person {
  id: string
  name: string
}

/**
 * Choosing a person, or several, by typing part of their name.
 *
 * The registry's `Combobox` in `inline` mode does the work: chips for who is
 * chosen, typing narrows the list, and the list sits in the form rather than a
 * popup that on a phone covers the form it belongs to. Filtering, keyboard
 * navigation and match announcements are Base UI's — a search box over a
 * filtered `.map()` is the wheel this repo does not reinvent.
 *
 * **Presentational on purpose.** Candidates are passed in, because who may be
 * picked is the caller's question and differs every time. Baking a query in is
 * what would make it wrong for its second use.
 *
 * A native select is still right for one person picked inline in a dense table
 * row, which is why the referee picker is not converted.
 */
export function PeoplePicker({
  people,
  value,
  onValueChange,
  multiple = true,
  id,
  placeholder,
  "data-testid": testId = "people-picker",
}: {
  people: Person[]
  value: Person[]
  onValueChange: (people: Person[]) => void
  multiple?: boolean
  /** Points the caller's `FieldLabel` at the input a reader actually types in. */
  id: string
  placeholder?: string
  "data-testid"?: string
}) {
  return (
    <Combobox
      items={people}
      multiple={multiple}
      // `inline` renders the list in the form instead of a popup, and Base UI
      // asks for `open` unconditionally when it does.
      inline
      open
      value={value}
      /* Base UI hands back `Person[] | Person | null`, because the same
         component serves single and multiple. Normalised here so every caller
         reads a list whichever mode it is in — one shape to hold in your head,
         and a single-select caller takes `[0]`. */
      onValueChange={(next: Person[] | Person | null) =>
        onValueChange(next == null ? [] : Array.isArray(next) ? next : [next])
      }
      itemToStringLabel={(p: Person) => p.name}
      // The values are rows from a query, so two renders of the same person are
      // not the same object.
      isItemEqualToValue={(a: Person, b: Person) => a.id === b.id}
    >
      <ComboboxChips>
        <ComboboxValue>
          {(chosen: Person[]) => (
            <>
              {chosen.map((p) => (
                <ComboboxChip key={p.id} data-testid={`chosen-${p.id}`}>
                  {p.name}
                </ComboboxChip>
              ))}
              <ComboboxChipsInput
                id={id}
                placeholder={placeholder ?? m.people_filter()}
                data-testid={`${testId}-search`}
              />
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>
      {/**
       * A fixed height, so the list cannot move the rest of the form.
       *
       * Candidates arrive from a query, so an unsized box grows the moment it
       * resolves and moves the submit button down with it. A `click` fires only
       * on the element that received both `mousedown` and `mouseup`; when the
       * button moves between them the browser fires `click` on the common
       * ancestor instead, and a click on a `<form>` submits nothing — with no
       * error, because from the page's view nothing happened.
       *
       * `h-56` on the box and `max-h-full` on the list, not `min-h-56` on each:
       * heights are border-box, so a 224px minimum gives a 222px content box
       * and a full list pushes it two pixels taller. Two pixels is still a
       * moving button. The box owns the height; the list is capped by it.
       * docs/done/2026-09-09-18-browser-tier-flakiness.md.
       */}
      <div className="h-56 overflow-hidden rounded-lg border">
        {/* `peer`, because inline mode has no popup to carry the
            `group/combobox-content` the registry's Empty looks for — the list
            itself is what knows it matched nothing. */}
        <ComboboxList className="peer max-h-full" data-testid={testId}>
          {(p: Person) => (
            // Keyed by the person, not by position. Without it React reconciles
            // this collection by index and says so on every page that renders a
            // picker.
            <ComboboxItem key={p.id} value={p} data-testid={`pick-${p.id}`}>
              {p.name}
            </ComboboxItem>
          )}
        </ComboboxList>
        <ComboboxEmpty className="peer-data-empty:flex" data-testid={`${testId}-none`}>
          {m.people_no_match()}
        </ComboboxEmpty>
      </div>
    </Combobox>
  )
}
