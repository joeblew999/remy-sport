import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, orpc } from "../lib/orpc"
import { formErrors } from "../lib/form-errors"
import { useLocale } from "../lib/locale"
import { m } from "../lib/i18n"

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
 */
export function EventDivisions({ eventId, canEdit }: { eventId: string; canEdit: boolean }) {
  const { name, label } = useLocale()
  const qc = useQueryClient()

  // The PO's fixtures — a re-seed is the only thing that changes them, which is
  // why the venues list uses the same staleTime.
  const { data: all } = useQuery(orpc.divisions.list.queryOptions({ staleTime: Infinity }))
  const { data: entries } = useQuery(orpc.events.entries.queryOptions({ input: { eventId } }))

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
    <div className="page-inner">
      <div className="section-h">
        <h2>{m.event_divisions()}</h2>
      </div>
      <form
        className="dash-card"
        data-testid="event-divisions"
        onSubmit={(e) => {
          e.preventDefault()
          const f = new FormData(e.currentTarget)
          save.mutate(f.getAll("division").map(String))
        }}
      >
        {divisions.length === 0 && <div className="empty">{m.loading()}</div>}
        {divisions.map((d) => (
          <label key={d.id} className="invite-row" data-testid={`division-${d.id}`}>
            <span>
              <input
                type="checkbox"
                name="division"
                value={d.id}
                defaultChecked={running.has(d.id)}
                // Ticked and locked: it has teams in it, so it cannot be
                // dropped without unregistering them.
                disabled={!canEdit || occupied.has(d.id)}
                data-testid={`division-check-${d.id}`}
              />{" "}
              {name(d.names)}
            </span>
            <span className="row-meta">
              {[label("ageGroups", d.ageGroupCode), label("genders", d.genderCode)]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </label>
        ))}

        {canEdit && divisions.length > 0 && (
          <button type="submit" data-testid="divisions-save" disabled={save.isPending}>
            {save.isPending ? m.event_saving() : m.event_save()}
          </button>
        )}

        {err.form && (
          <p className="admin-error small" data-testid="divisions-error">{err.form}</p>
        )}
      </form>
    </div>
  )
}
