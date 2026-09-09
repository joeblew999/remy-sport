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
 * The Product Owner liked the meeting invite form and asked whether the pattern
 * could be reused wherever the app needs to pick a user. This is that form's
 * control, lifted out unchanged in behaviour.
 *
 * The registry's `Combobox` in `inline` mode does the work: chips for who is
 * chosen, typing narrows the list, and the list sits in the form rather than in
 * a popup layered over it — on a phone that popup covers the very form it
 * belongs to. Filtering, keyboard navigation and announcing how many matches
 * remain are Base UI's, not ours; a search box over a filtered `.map()` is the
 * wheel this repo does not reinvent.
 *
 * **Presentational on purpose.** The candidates are passed in rather than
 * fetched, because who may be picked is the caller's question and differs every
 * time — everyone on the platform for a meeting, people not already in a school
 * for a membership. Baking a query in is what would make it wrong for its
 * second use.
 *
 * A native select is still right for one person chosen inline in a dense table
 * row, which is why the referee picker is not converted. This is for a form
 * with room, where the reader may not know the name they are looking for.
 *
 * docs/2026-09-09-14-people-picker.md.
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
      <div className="rounded-lg border">
        {/* `peer`, because inline mode has no popup to carry the
            `group/combobox-content` the registry's Empty looks for — the list
            itself is what knows it matched nothing. */}
        <ComboboxList className="peer max-h-56" data-testid={testId}>
          {(p: Person) => (
            <ComboboxItem value={p} data-testid={`pick-${p.id}`}>
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
