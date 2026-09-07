import { useLocale } from "../lib/locale"
import { NameTranslations, namesFrom } from "./name-translations"
import { Can } from "./can";
/**
 * Editing an event you organise.
 *
 * `events.update` has existed and been enforced by `EDIT_EVENT` for as long as
 * there have been events, and nothing in the app could call it. So an organiser
 * could create a tournament and then never fix a typo in its name or move it
 * when the gym fell through — the only remedy was an HTTP client, which is not
 * a remedy.
 *
 * The tab appears only where `can.EDIT_EVENT` is true, which is the model's answer for
 * this reader on this event. That is the same rule the org profile follows and
 * for the same reason: offering a Save button to everyone and answering 403
 * when it is pressed teaches people that the app is broken, when in fact it is
 * working exactly as designed.
 *
 * Name fields follow the configured locales and preserve unknown translations.
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

/**
 * @answers EDIT_EVENT, INVITE_CO_ORGANIZER
 *
 * An organiser's own event, and who else may run it.
 */
export function EventSettings({ event }: { event: Event }) {
  const qc = useQueryClient()
  const { terms, name } = useLocale()
  const [saved, setSaved] = useState(false)
  const [startDate, setStartDate] = useState(event.startDate ?? "")
  const [endDate, setEndDate] = useState(event.endDate ?? "")

  // No `useState` for the error: the mutation already holds it, and a copy in
  // state has to be cleared by hand on every success — a second place for "is
  // there an error right now" to be wrong.
  const save = useMutation({
    mutationFn: (v: Omit<Parameters<typeof api.events.update>[0], "id">) =>
      api.events.update({ id: event.id, ...v }),
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
              names: namesFrom(f, event.names),
              startDate: String(f.get("startDate") ?? "") || null,
              endDate: String(f.get("endDate") ?? "") || null,
              description: String(f.get("description") ?? ""),
              timezone: String(f.get("timezone") ?? ""),
              formatCode: String(f.get("formatCode")) as Event["formatCode"],
              typeCode: String(f.get("typeCode")) as Event["typeCode"],
              cityCode: (String(f.get("cityCode")) || undefined) as Parameters<typeof api.events.update>[0]["cityCode"],
              provinceCode: (String(f.get("provinceCode")) || undefined) as Parameters<typeof api.events.update>[0]["provinceCode"],
              isFibaCertified: f.has("isFibaCertified"),
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

          <NameTranslations names={event.names} id="event-name" />
          <label htmlFor="event-description">{m.description()}</label>
          <textarea id="event-description" name="description" defaultValue={event.description ?? ""} />
          <label htmlFor="event-timezone">{m.event_timezone()}</label>
          <input id="event-timezone" name="timezone" required defaultValue={event.timezone ?? "UTC"} />
          {([
            ["typeCode", "eventTypes", m.event_type(), event.typeCode],
            ["formatCode", "eventFormats", m.event_format(), event.formatCode],
            ["cityCode", "cities", m.event_city(), event.cityCode],
            ["provinceCode", "provinces", m.province(), event.provinceCode],
          ] as const).map(([field, vocabulary, title, value]) => (
            <label key={field} htmlFor={`event-${field}`}>{title}
              <select id={`event-${field}`} name={field} defaultValue={value ?? ""}>
                {!value && <option value="">—</option>}
                {terms(vocabulary).map((term) => <option key={term.code} value={term.code}>{name(term.names, term.code)}</option>)}
              </select>
            </label>
          ))}
          <label><input type="checkbox" name="isFibaCertified" defaultChecked={event.isFibaCertified} /> {m.event_fiba()}</label>

          <label htmlFor="event-start">{m.event_start_label()}</label>
          <input
            id="event-start"
            name="startDate"
            type="date"
            data-testid="event-start-input"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
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
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
          {err.field("endDate") && <p className="admin-error small">{err.field("endDate")}</p>}

          <p className="muted small">{m.event_dates_hint()}</p>

          <button type="submit" data-testid="event-save" disabled={save.isPending}>
            {save.isPending ? m.event_saving() : m.event_save()}
          </button>
        </form>
      </section>

      {/* A *different* grant from the one above. EDIT_EVENT is granted to
          OWNER, CO_ORGANIZER and PLATFORM_ADMIN; INVITE_CO_ORGANIZER only to
          OWNER and PLATFORM_ADMIN — deciding who else runs your tournament is
          not something you delegate by having been delegated to. Reusing
          `can.EDIT_EVENT` here would have offered a form that answers 403. */}
      <Can of={event} action="INVITE_CO_ORGANIZER"><InviteCoOrganizer eventId={event.id} /></Can>
    </div>
  )
}

/**
 * Asking somebody to help run this event.
 *
 * The other half of a feature whose accept side shipped first: there was a
 * screen to take an invitation up and none to send one, so the only way to
 * create the pending state was SQL or a fixture.
 *
 * By email, because nobody knows another person's user id and the only way to
 * offer one would be a searchable directory of everybody on the platform — a
 * privacy surface this product should not grow to power an invite box.
 */
function InviteCoOrganizer({ eventId }: { eventId: string }) {
  const qc = useQueryClient()
  const [sent, setSent] = useState(false)

  const invite = useMutation({
    mutationFn: (email: string) => api.events.addCoOrganizer({ id: eventId, email }),
    onSuccess: () => {
      setSent(true)
      // The invitee's list, not ours — but a co-organiser who accepts changes
      // who may edit, so the event list is stale either way.
      void qc.invalidateQueries({ queryKey: orpc.events.key() })
      setTimeout(() => setSent(false), 2500)
    },
  })

  const err = formErrors(invite.error, ["email"])

  return (
    <section className="admin-card" style={{ marginTop: 16 }} data-testid="invite-co-organizer">
      <h2>{m.invite_co_organizer()}</h2>
      <p className="muted small">{m.invite_co_organizer_hint()}</p>
      {sent && <div className="admin-ok" data-testid="invite-sent">{m.invite_sent()}</div>}
      {err.form && <div className="admin-error" data-testid="invite-error">{err.form}</div>}

      <form
        className="admin-form"
        onSubmit={(e) => {
          e.preventDefault()
          const form = e.currentTarget
          invite.mutate(String(new FormData(form).get("email")), {
            // Cleared only on success, so a rejected address stays in the box
            // to be corrected rather than making the reader type it again.
            onSuccess: () => form.reset(),
          })
        }}
      >
        <label htmlFor="invite-email">{m.invite_email()}</label>
        <input
          id="invite-email"
          name="email"
          type="email"
          data-testid="invite-email-input"
          required
          autoComplete="off"
        />
        {err.field("email") && (
          <p className="admin-error small" data-testid="invite-email-issue">{err.field("email")}</p>
        )}
        <button type="submit" data-testid="invite-send" disabled={invite.isPending}>
          {invite.isPending ? m.invite_sending() : m.invite_send()}
        </button>
      </form>
    </section>
  )
}
