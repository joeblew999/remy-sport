/**
 * Editing an event you organise.
 *
 * `events.update` has existed and been enforced by `EDIT_EVENT` for as long as
 * there have been events, and nothing in the app could call it. So an organiser
 * could create a tournament and then never fix a typo in its name or move it
 * when the gym fell through — the only remedy was an HTTP client, which is not
 * a remedy.
 *
 * The tab appears only where `canEdit` is true, which is the model's answer for
 * this reader on this event. That is the same rule the org profile follows and
 * for the same reason: offering a Save button to everyone and answering 403
 * when it is pressed teaches people that the app is broken, when in fact it is
 * working exactly as designed.
 *
 * ## Only `names.en`
 *
 * The column is a locale map and the API takes the whole thing, but a form with
 * one box per language would quietly assert that English and Thai are the
 * languages this product has — `ALL_LOCALES` decides that, and it has three.
 * Translating an event name is a localisation surface, not a details form. The
 * other locales are preserved on write rather than dropped.
 *
 * ## Dates can be emptied
 *
 * An event that exists before its dates are fixed is a real state — the column
 * is nullable and the fixtures use it. A form that could only ever set a date
 * would make that state reachable in SQL and unreachable here, which is the
 * shape of bug this session has been removing everywhere else.
 */

import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api, orpc } from "../lib/orpc"
import { formErrors } from "../lib/form-errors"
import { m } from "../lib/i18n"
import type { Event } from "../data"

export function EventSettings({ event }: { event: Event }) {
  const qc = useQueryClient()
  const [saved, setSaved] = useState(false)

  // No `useState` for the error: the mutation already holds it, and a copy in
  // state has to be cleared by hand on every success — a second place for "is
  // there an error right now" to be wrong.
  const save = useMutation({
    mutationFn: (v: { name: string; startDate: string; endDate: string }) =>
      api.events.update({
        id: event.id,
        // The rest of the locale map survives. Sending only `{ en }` would
        // silently delete the Thai and Japanese names on the first save.
        names: { ...event.names, en: v.name },
        // Empty string means "not fixed", which the API takes as null. An
        // `undefined` here would mean "leave it alone", and there would be no
        // way to clear a date once set.
        startDate: v.startDate || undefined,
        endDate: v.endDate || undefined,
      }),
    onSuccess: () => {
      setSaved(true)
      void qc.invalidateQueries({ queryKey: orpc.events.key() })
      setTimeout(() => setSaved(false), 2000)
    },
  })

  // Every path this form renders, accounted for — an issue on a path nobody
  // claimed is carried to the form-level message rather than dropped. See
  // lib/form-errors.ts for the silence this avoids.
  const err = formErrors(save.error, ["names[en]", "startDate", "endDate"])

  return (
    <div className="page-inner">
      <section className="admin-card" data-testid="event-settings">
        <h2>{m.event_settings()}</h2>
        {saved && <div className="admin-ok" data-testid="event-saved">{m.event_saved()}</div>}
        {err.form && (
          <div className="admin-error" data-testid="event-settings-error">{err.form}</div>
        )}

        <form
          className="admin-form"
          onSubmit={(e) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            save.mutate({
              name: String(f.get("name")),
              startDate: String(f.get("startDate") ?? ""),
              endDate: String(f.get("endDate") ?? ""),
            })
          }}
        >
          <label htmlFor="event-name">{m.event_name_label()}</label>
          <input
            id="event-name"
            name="name"
            data-testid="event-name-input"
            defaultValue={event.names.en ?? event.title}
            required
            autoComplete="off"
          />
          {err.field("names[en]") && (
            <p className="admin-error small" data-testid="event-name-issue">
              {err.field("names[en]")}
            </p>
          )}

          <label htmlFor="event-start">{m.event_start_label()}</label>
          <input
            id="event-start"
            name="startDate"
            type="date"
            data-testid="event-start-input"
            defaultValue={event.startDate ?? ""}
          />
          {err.field("startDate") && (
            <p className="admin-error small">{err.field("startDate")}</p>
          )}

          <label htmlFor="event-end">{m.event_end_label()}</label>
          <input
            id="event-end"
            name="endDate"
            type="date"
            data-testid="event-end-input"
            defaultValue={event.endDate ?? ""}
          />
          {err.field("endDate") && <p className="admin-error small">{err.field("endDate")}</p>}

          <p className="muted small">{m.event_dates_hint()}</p>

          <button type="submit" data-testid="event-save" disabled={save.isPending}>
            {save.isPending ? m.event_saving() : m.event_save()}
          </button>
        </form>
      </section>
    </div>
  )
}
