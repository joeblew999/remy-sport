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
import { useInitial } from "../lib/initial"
import { api, orpc } from "../lib/orpc"
import { formErrors } from "../lib/form-errors"
import { m } from "../lib/i18n"
import type { Event } from "../data"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"

/**
 * @answers EDIT_EVENT, INVITE_CO_ORGANIZER
 *
 * An organiser's own event, and who else may run it.
 */
export function EventSettings({ event }: { event: Event }) {
  const qc = useQueryClient()
  const { terms, name } = useLocale()
  const [startDate, setStartDate] = useState(event.startDate ?? "")
  const [endDate, setEndDate] = useState(event.endDate ?? "")
  // The uncontrolled fields open with the event as it was, and keep that
  // after the save's refetch — see lib/initial.ts. Keyed by id where rendered.
  const initial = useInitial(event)

  // No `useState` for the error: the mutation already holds it, and a copy in
  // state has to be cleared by hand on every success — a second place for "is
  // there an error right now" to be wrong.
  const save = useMutation({
    mutationFn: (v: Omit<Parameters<typeof api.events.update>[0], "id">) =>
      api.events.update({ id: event.id, ...v }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: orpc.events.key() })
    },
  })

  // Every path this form renders, accounted for — an issue on a path nobody
  // claimed is carried to the form-level message rather than dropped. See
  // lib/form-errors.ts for the silence this avoids.
  const err = formErrors(save.error, ["names[en]", "startDate", "endDate"])

  return (
    <div className="flex flex-col gap-6">
      <Card data-testid="event-settings">
        <CardHeader><CardTitle>{m.event_settings()}</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
        {save.isSuccess && (
          <Alert role="status" data-testid="event-saved">
            <AlertDescription>{m.event_saved()}</AlertDescription>
          </Alert>
        )}
        {err.form && (
          <Alert variant="destructive" data-testid="event-settings-error">
            <AlertDescription>{err.form}</AlertDescription>
          </Alert>
        )}

        <form
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
          <FieldGroup className="max-w-[420px]">
            <Field data-invalid={!!err.field("names[en]") || undefined}>
              <FieldLabel htmlFor="event-name">{m.event_name_label()}</FieldLabel>
              <Input
                id="event-name"
                aria-invalid={!!err.field("names[en]")}
                aria-describedby={err.field("names[en]") ? "event-name-issue" : undefined}
                name="name"
                data-testid="event-name-input"
                defaultValue={initial.names.en ?? initial.title}
                required
                autoComplete="off"
              />
              {err.field("names[en]") && (
                <FieldError id="event-name-issue" data-testid="event-name-issue">
                  {err.field("names[en]")}
                </FieldError>
              )}
            </Field>

            <NameTranslations names={initial.names} id="event-name" />
            <Field>
              <FieldLabel htmlFor="event-description">{m.description()}</FieldLabel>
              <Textarea id="event-description" name="description" defaultValue={initial.description ?? ""} />
            </Field>
            <Field>
              <FieldLabel htmlFor="event-timezone">{m.event_timezone()}</FieldLabel>
              <Input id="event-timezone" name="timezone" required defaultValue={initial.timezone ?? "UTC"} />
            </Field>
            {([
              ["typeCode", "eventTypes", m.event_type(), initial.typeCode],
              ["formatCode", "eventFormats", m.event_format(), initial.formatCode],
              ["cityCode", "cities", m.event_city(), initial.cityCode],
              ["provinceCode", "provinces", m.province(), initial.provinceCode],
            ] as const).map(([field, vocabulary, title, value]) => (
              <Field key={field}>
                <FieldLabel htmlFor={`event-${field}`}>{title}</FieldLabel>
                <NativeSelect id={`event-${field}`} name={field} defaultValue={value ?? ""}>
                  {!value && <NativeSelectOption value="">—</NativeSelectOption>}
                  {terms(vocabulary).map((term) => <NativeSelectOption key={term.code} value={term.code}>{name(term.names, term.code)}</NativeSelectOption>)}
                </NativeSelect>
              </Field>
            ))}
            <div className="flex items-center gap-2">
              <Checkbox id="event-fiba" name="isFibaCertified" defaultChecked={initial.isFibaCertified} />
              <Label htmlFor="event-fiba" className="font-normal">{m.event_fiba()}</Label>
            </div>

            <Field data-invalid={!!err.field("startDate") || undefined}>
              <FieldLabel htmlFor="event-start">{m.event_start_label()}</FieldLabel>
              <Input
                id="event-start"
                aria-invalid={!!err.field("startDate")}
                aria-describedby={err.field("startDate") ? "event-start-issue" : undefined}
                name="startDate"
                type="date"
                data-testid="event-start-input"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              {err.field("startDate") && (
                <FieldError id="event-start-issue">{err.field("startDate")}</FieldError>
              )}
            </Field>

            <Field data-invalid={!!err.field("endDate") || undefined}>
              <FieldLabel htmlFor="event-end">{m.event_end_label()}</FieldLabel>
              <Input
                id="event-end"
                aria-invalid={!!err.field("endDate")}
                aria-describedby={err.field("endDate") ? "event-end-issue" : undefined}
                name="endDate"
                type="date"
                data-testid="event-end-input"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
              {err.field("endDate") && <FieldError id="event-end-issue">{err.field("endDate")}</FieldError>}
            </Field>

            <p className="text-sm text-muted-foreground">{m.event_dates_hint()}</p>

            <Button type="submit" data-testid="event-save" disabled={save.isPending} className="w-fit">
              {save.isPending ? m.event_saving() : m.event_save()}
            </Button>
          </FieldGroup>
        </form>
        </CardContent>
      </Card>

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
    <Card data-testid="invite-co-organizer">
      <CardHeader>
        <CardTitle>{m.invite_co_organizer()}</CardTitle>
        <CardDescription>{m.invite_co_organizer_hint()}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
      {sent && (
        <Alert role="status" data-testid="invite-sent">
          <AlertDescription>{m.invite_sent()}</AlertDescription>
        </Alert>
      )}
      {err.form && (
        <Alert variant="destructive" data-testid="invite-error">
          <AlertDescription>{err.form}</AlertDescription>
        </Alert>
      )}

      <form
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
        <FieldGroup className="max-w-[420px]">
          <Field data-invalid={!!err.field("email") || undefined}>
            <FieldLabel htmlFor="invite-email">{m.invite_email()}</FieldLabel>
            <Input
              id="invite-email"
              name="email"
              type="email"
              data-testid="invite-email-input"
              required
              autoComplete="off"
            />
            {err.field("email") && (
              <FieldError data-testid="invite-email-issue">{err.field("email")}</FieldError>
            )}
          </Field>
          <Button type="submit" data-testid="invite-send" disabled={invite.isPending} className="w-fit">
            {invite.isPending ? m.invite_sending() : m.invite_send()}
          </Button>
        </FieldGroup>
      </form>
      </CardContent>
    </Card>
  )
}
