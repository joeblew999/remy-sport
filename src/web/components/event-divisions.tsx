import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, orpc } from "../lib/orpc"
import { formErrors } from "../lib/form-errors"
import { useLocale } from "../lib/locale"
import { m } from "../lib/i18n"
import type { Event } from "../data"
import { QueryError } from "./query-error"
import { SectionHeading } from "./page"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Item, ItemContent, ItemDescription, ItemGroup } from "@/components/ui/item"
import { Label } from "@/components/ui/label"

/**
 * Which divisions this event runs.
 *
 * A `division` is a classification — an age group, a gender, a skill tier and a
 * name — and "U16 Boys" means the same thing in every tournament, so that list
 * is global. Which of them an event runs is a fact about the event, and until
 * 2026-08-31 it had nowhere to live: it was inferred from whoever had
 * registered. So an organiser could not declare divisions before registration
 * opened, a division nobody had entered yet was invisible, and the registration
 * form offered every division on the platform.
 *
 * ## The whole set at once
 *
 * Checkboxes and one Save, not an add button per row. `MANAGE_DIVISIONS` is
 * about what this event runs, and a per-division add makes "we are not running
 * U18 Girls after all" impossible to say.
 *
 * A division with teams registered in it cannot be unticked: dropping it would
 * orphan their entries and silently unregister them. The API refuses it and
 * says which; the box is disabled so the refusal is visible before the click
 * rather than after it.
 *
 * @answers MANAGE_DIVISIONS
 *
 * Which divisions an event runs.
 */
export function EventDivisions({ eventId, can }: { eventId: string; can: Event["can"] }) {
  const { name, label } = useLocale()
  const qc = useQueryClient()

  // The PO's fixtures — a re-seed is the only thing that changes them, which is
  // why the venues list uses the same staleTime.
  const catalogue = useQuery(orpc.divisions.list.queryOptions({ staleTime: Infinity }))
  const participation = useQuery(orpc.events.entries.queryOptions({ input: { eventId } }))
  const all = catalogue.data
  const entries = participation.data

  const running = new Set((entries?.divisions ?? []).map((d) => d.id))
  // Which ones have teams in them, and so cannot be dropped.
  const occupied = new Set((entries?.registered ?? []).map((r) => r.divisionId))

  const save = useMutation({
    mutationFn: (divisionIds: string[]) => api.events.setDivisions({ id: eventId, divisionIds }),
    onSuccess: () => qc.invalidateQueries({ queryKey: orpc.events.key() }),
  })
  const err = formErrors(save.error)

  const divisions = all?.items ?? []

  return (
    <div className="flex flex-col gap-3">
      <SectionHeading title={m.event_divisions()} className="mt-0 mb-0" />
      <Card>
      <CardContent>
      <form
        className="flex flex-col gap-4"
        data-testid="event-divisions"
        onSubmit={(e) => {
          e.preventDefault()
          const f = new FormData(e.currentTarget)
          save.mutate(f.getAll("division").map(String))
        }}
      >
        <QueryError error={catalogue.error} retry={catalogue.refetch} pending={catalogue.isFetching} />
        <QueryError error={participation.error} retry={participation.refetch} pending={participation.isFetching} />
        {(catalogue.isPending || participation.isPending) && <p role="status">{m.loading()}</p>}
        {catalogue.isSuccess && divisions.length === 0 && <p data-testid="divisions-empty">{m.divisions_empty()}</p>}
        {/* Mount uncontrolled checkboxes only after both queries resolve. Otherwise
            defaultChecked captures the empty participation set during a slow load. */}
        {entries && <fieldset disabled={save.isPending || !!participation.error || !!catalogue.error}>
        <legend className="sr-only">{m.event_divisions()}</legend>
        <ItemGroup className="gap-0 divide-y">
        {divisions.map((d) => (
          <Item key={d.id} className="rounded-none px-0" data-testid={`division-${d.id}`}>
            <Checkbox
              id={`division-check-${d.id}`}
              name="division"
              value={d.id}
              defaultChecked={running.has(d.id)}
              // Ticked and locked: it has teams in it, so it cannot be
              // dropped without unregistering them.
              disabled={!can.MANAGE_DIVISIONS || occupied.has(d.id)}
              data-testid={`division-check-${d.id}`}
            />
            <ItemContent>
              <Label htmlFor={`division-check-${d.id}`} className="font-normal">{name(d.names)}</Label>
            </ItemContent>
            <ItemDescription>
              {[label("ageGroups", d.ageGroupCode), label("genders", d.genderCode)]
                .filter(Boolean)
                .join(" · ")}
            </ItemDescription>
          </Item>
        ))}
        </ItemGroup>
        </fieldset>}

        {can.MANAGE_DIVISIONS && divisions.length > 0 && (
          <Button type="submit" data-testid="divisions-save" disabled={save.isPending || !entries || !!participation.error || !!catalogue.error} className="w-fit">
            {save.isPending ? m.event_saving() : m.event_save()}
          </Button>
        )}
        {save.isSuccess && (
          <Alert role="status">
            <AlertDescription>{m.event_saved()}</AlertDescription>
          </Alert>
        )}

        {err.form && (
          <Alert variant="destructive" data-testid="divisions-error">
            <AlertDescription>{err.form}</AlertDescription>
          </Alert>
        )}
      </form>
      </CardContent>
      </Card>
    </div>
  )
}
