import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, orpc } from "../lib/orpc"
import { formErrors } from "../lib/form-errors"
import { useLocale } from "../lib/locale"
import { formatClockOn, fromLocalInput } from "../lib/dates"
import { m } from "../lib/i18n"
import type { Event } from "../data"
import { SectionHeading } from "./page"
import { EmptyState, Loading } from "./states"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Label } from "@/components/ui/label"

/**
 * A camp's timetable.
 *
 * A camp is skill training rather than competition, so it has no fixtures — the
 * schedule tab a league gets would show an empty table forever. It has sessions:
 * a block, a place, and what that block covers. `DEFINE_SESSION_SCHEDULE` had no
 * endpoint until 2026-08-31, so an organiser could create a camp, watch children
 * register, and had no way to tell anyone when to turn up.
 *
 * `can.DEFINE_SESSION_SCHEDULE` is the event's answer, not a role read here — and it
 * is on the list rather than per session because the question is about the
 * event, and the page needs it before there is a session to ask about.
 *
 * The form is offered only to somebody who may use it. A coach may not: the
 * model gives them `RECORD_ATTENDANCE` and withholds the schedule, which is a
 * distinction worth keeping rather than flattening to "staff".
 *
 * @answers DEFINE_SESSION_SCHEDULE, RECORD_ATTENDANCE
 *
 * A camp's sessions, and who turned up.
 */
export function EventSessions({ eventId, can, timezone }: { eventId: string; can: Event["can"]; timezone: Event["timezone"] }) {
  const { name, locale } = useLocale()
  const qc = useQueryClient()
  const { data, isPending } = useQuery(orpc.events.sessions.queryOptions({ input: { eventId } }))

  const invalidate = () => qc.invalidateQueries({ queryKey: orpc.events.key() })

  const addSession = useMutation({
    mutationFn: (v: { names: Record<string, string>; startsAt: string; endsAt: string }) =>
      api.events.addSession({ eventId, ...v }),
    onSuccess: invalidate,
  })
  const removeSession = useMutation({
    mutationFn: (id: string) => api.events.removeSession({ id, eventId }),
    onSuccess: invalidate,
  })

  // One register open at a time.
  const [openRegister, setOpenRegister] = useState<string | null>(null)

  const err = formErrors(addSession.error ?? removeSession.error)
  const sessions = data?.sessions ?? []

  /**
   * "Mon 6 Jul, 09:00 – 11:00" **on the venue's clock**.
   *
   * The first version used the browser's zone, which renders a 09:00 Bangkok
   * session as 04:00 for a reader in London — a parent would arrive five hours
   * late. The schedule already had this right for fixtures; these are the same
   * helpers, so there is one convention and not two.
   */
  const when = (startsAt: string, endsAt: string, timeZone: string | null) => {
    const day = new Date(startsAt).toLocaleDateString(locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
      ...(timeZone ? { timeZone } : {}),
    })
    const from = formatClockOn(locale, new Date(startsAt), timeZone)
    const to = formatClockOn(locale, new Date(endsAt), timeZone)
    return `${day}, ${from} – ${to}`
  }

  /** The venue's clock, from the first session — they share an event. */
  const zone = timezone ?? data?.sessions[0]?.timezone ?? null

  return (
    <div className="flex flex-col gap-4">
      <SectionHeading title={m.event_sessions()} className="mt-0 mb-0" />

      <ItemGroup className="gap-0 divide-y overflow-hidden rounded-xl border" data-testid="event-sessions">
        {isPending && <Loading className="border-0" />}
        {!isPending && sessions.length === 0 && (
          <EmptyState className="border-0" data-testid="sessions-none">{m.event_sessions_none()}</EmptyState>
        )}
        {sessions.map((s) => (
          <Item key={s.id} className="flex-wrap rounded-none px-4 py-3" data-testid={`session-${s.id}`}>
            <ItemContent>
              <ItemTitle className="text-base">{name(s.names)}</ItemTitle>
              <ItemDescription>
                {[when(s.startsAt, s.endsAt, s.timezone), s.venueNames ? name(s.venueNames) : null]
                  .filter(Boolean)
                  .join(" · ")}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              {/* The register, one session at a time. Two open at once is a way
                  to tick the wrong morning. */}
              <Button
                variant="outline"
                data-testid={`register-${s.id}`}
                onClick={() => setOpenRegister(openRegister === s.id ? null : s.id)}
              >
                {m.event_session_register()}
              </Button>
              {can.DEFINE_SESSION_SCHEDULE && (
                <Button
                  variant="outline"
                  data-testid={`remove-session-${s.id}`}
                  disabled={removeSession.isPending}
                  onClick={() => removeSession.mutate(s.id)}
                >
                  {m.fixture_remove()}
                </Button>
              )}
            </ItemActions>
            {openRegister === s.id && <Register eventId={eventId} sessionId={s.id} can={can} />}
          </Item>
        ))}
      </ItemGroup>

      {can.DEFINE_SESSION_SCHEDULE && (
        <Card>
        <CardHeader><CardTitle>{m.event_session_add()}</CardTitle></CardHeader>
        <CardContent>
        <form
          data-testid="add-session"
          onSubmit={(e) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            addSession.mutate({
              names: { en: String(f.get("name")) },
              // Typed on the venue's clock and stored as UTC — `datetime-local`
              // carries no zone, which is exactly what `fromLocalInput` is for
              // and what the fixture form already does.
              startsAt: fromLocalInput(String(f.get("startsAt")), zone),
              endsAt: fromLocalInput(String(f.get("endsAt")), zone),
            })
          }}
        >
          <FieldGroup className="max-w-[420px]">
            <Field>
              <FieldLabel htmlFor="session-name">{m.event_session_name()}</FieldLabel>
              <Input id="session-name" name="name" required data-testid="session-name" />
            </Field>

            <Field>
              <FieldLabel htmlFor="session-start">{m.event_session_starts()}</FieldLabel>
              <Input id="session-start" name="startsAt" type="datetime-local" required data-testid="session-start" />
            </Field>

            <Field>
              <FieldLabel htmlFor="session-end">{m.event_session_ends()}</FieldLabel>
              <Input id="session-end" name="endsAt" type="datetime-local" required data-testid="session-end" />
            </Field>

            <Button type="submit" data-testid="session-save" disabled={addSession.isPending} className="w-fit">
              {addSession.isPending ? m.org_saving() : m.event_session_add()}
            </Button>

            {err.form && (
              <Alert variant="destructive" data-testid="session-error">
                <AlertDescription>{err.form}</AlertDescription>
              </Alert>
            )}
          </FieldGroup>
        </form>
        </CardContent>
        </Card>
      )}
    </div>
  )
}

/**
 * Who turned up to one session.
 *
 * Every child entered in the camp is a row, ticked or not — a register showing
 * only those present is a list, and the person holding it needs to see who is
 * missing. An unticked box means "not marked", which is the same state as
 * "absent" on purpose: the API stores a row for attendance and nothing for its
 * absence, because "marked absent" and "nobody has been round yet" are
 * different facts and one column cannot hold both.
 *
 * `can.RECORD_ATTENDANCE` is the event's answer. It is wider than defining above — the
 * model gives a camp's coaches the register and withholds the timetable — though
 * today it reaches only the organisers, because HEAD_COACH is a relation to a
 * team and this action acts on an event. `scripts/check-tables.ts` tracks that
 * pair as a known unresolvable grant.
 */
function Register({
  eventId,
  sessionId,
  can,
}: {
  eventId: string
  sessionId: string
  can: Event["can"]
}) {
  const { name } = useLocale()
  const qc = useQueryClient()
  const { data, isPending } = useQuery(
    orpc.events.attendance.queryOptions({ input: { eventId, sessionId } }),
  )

  const record = useMutation({
    mutationFn: (v: { playerId: string; attended: boolean }) =>
      api.events.recordAttendance({ eventId, sessionId, ...v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: orpc.events.key() }),
  })

  const attendanceError = formErrors(record.error)
  const players = data?.players ?? []

  return (
    <ItemGroup className="mt-2 basis-full gap-0 divide-y overflow-hidden rounded-lg border" data-testid={`register-list-${sessionId}`}>
      {isPending && <Loading className="border-0" />}
      {!isPending && players.length === 0 && (
        <EmptyState className="border-0" data-testid="register-empty">{m.event_session_register_none()}</EmptyState>
      )}
      {players.map((p) => (
        <Item key={p.playerId} className="rounded-none" data-testid={`attendee-${p.playerId}`}>
          <Checkbox
            id={`attended-${p.playerId}`}
            checked={p.attended}
            disabled={!can.RECORD_ATTENDANCE || record.isPending}
            data-testid={`attended-${p.playerId}`}
            onCheckedChange={(checked) =>
              record.mutate({ playerId: p.playerId, attended: checked === true })
            }
          />
          <Label htmlFor={`attended-${p.playerId}`} className="flex-1 font-normal">{name(p.names)}</Label>
        </Item>
      ))}
      {attendanceError.form && (
        <Alert variant="destructive">
          <AlertDescription>{attendanceError.form}</AlertDescription>
        </Alert>
      )}
    </ItemGroup>
  )
}
