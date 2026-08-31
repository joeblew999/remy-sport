import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, orpc } from "../lib/orpc"
import { formErrors } from "../lib/form-errors"
import { useLocale } from "../lib/locale"
import { formatClockOn, fromLocalInput } from "../lib/dates"
import { m } from "../lib/i18n"

/**
 * A camp's timetable.
 *
 * A camp is skill training rather than competition, so it has no fixtures — the
 * schedule tab a league gets would show an empty table forever. It has sessions:
 * a block, a place, and what that block covers. `DEFINE_SESSION_SCHEDULE` had no
 * endpoint until 2026-08-31, so an organiser could create a camp, watch children
 * register, and had no way to tell anyone when to turn up.
 *
 * `canDefine` is the server's answer on the list, not a role read here — and it
 * is on the list rather than per session because the question is about the
 * event, and the page needs it before there is a session to ask about.
 *
 * The form is offered only to somebody who may use it. A coach may not: the
 * model gives them `RECORD_ATTENDANCE` and withholds the schedule, which is a
 * distinction worth keeping rather than flattening to "staff".
 */
export function EventSessions({ eventId }: { eventId: string }) {
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

  const err = formErrors(addSession.error, ["startsAt", "endsAt"])
  const sessions = data?.sessions ?? []
  const canDefine = data?.canDefine ?? false

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
  const zone = data?.sessions[0]?.timezone ?? null

  return (
    <div className="page-inner">
      <div className="section-h">
        <h2>{m.event_sessions()}</h2>
      </div>

      <div className="dash-card" data-testid="event-sessions">
        {isPending && <div className="empty">{m.loading()}</div>}
        {!isPending && sessions.length === 0 && (
          <div className="empty" data-testid="sessions-none">{m.event_sessions_none()}</div>
        )}
        {sessions.map((s) => (
          <div key={s.id} className="invite-row" data-testid={`session-${s.id}`}>
            <div>
              <div className="row-title">{name(s.names)}</div>
              <div className="row-meta">
                {[when(s.startsAt, s.endsAt, s.timezone), s.venueNames ? name(s.venueNames) : null]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
            <span>
              {/* The register, one session at a time. Two open at once is a way
                  to tick the wrong morning. */}
              <button
                className="btn"
                data-testid={`register-${s.id}`}
                onClick={() => setOpenRegister(openRegister === s.id ? null : s.id)}
              >
                {m.event_session_register()}
              </button>
              {canDefine && (
                <button
                  className="btn"
                  data-testid={`remove-session-${s.id}`}
                  disabled={removeSession.isPending}
                  onClick={() => removeSession.mutate(s.id)}
                >
                  {m.fixture_remove()}
                </button>
              )}
            </span>
          </div>
        ))}
        {openRegister && <Register eventId={eventId} sessionId={openRegister} />}
      </div>

      {canDefine && (
        <form
          className="admin-card"
          style={{ marginTop: 16 }}
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
          <h2>{m.event_session_add()}</h2>
          <label htmlFor="session-name">{m.event_session_name()}</label>
          <input id="session-name" name="name" required data-testid="session-name" />

          <label htmlFor="session-start">{m.event_session_starts()}</label>
          <input id="session-start" name="startsAt" type="datetime-local" required data-testid="session-start" />

          <label htmlFor="session-end">{m.event_session_ends()}</label>
          <input id="session-end" name="endsAt" type="datetime-local" required data-testid="session-end" />

          <button type="submit" data-testid="session-save" disabled={addSession.isPending}>
            {addSession.isPending ? m.org_saving() : m.event_session_add()}
          </button>

          {err.form && (
            <p className="admin-error small" data-testid="session-error">{err.form}</p>
          )}
        </form>
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
 * `canRecord` is the server's answer. It is wider than `canDefine` above — the
 * model gives a camp's coaches the register and withholds the timetable — though
 * today it reaches only the organisers, because HEAD_COACH is a relation to a
 * team and this action acts on an event. `scripts/check-tables.ts` tracks that
 * pair as a known unresolvable grant.
 */
function Register({ eventId, sessionId }: { eventId: string; sessionId: string }) {
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

  const players = data?.players ?? []

  return (
    <div className="dash-card" data-testid={`register-list-${sessionId}`} style={{ marginTop: 8 }}>
      {isPending && <div className="empty">{m.loading()}</div>}
      {!isPending && players.length === 0 && (
        <div className="empty" data-testid="register-empty">{m.event_session_register_none()}</div>
      )}
      {players.map((p) => (
        <label key={p.playerId} className="invite-row" data-testid={`attendee-${p.playerId}`}>
          <span>
            <input
              type="checkbox"
              checked={p.attended}
              disabled={!data?.canRecord || record.isPending}
              data-testid={`attended-${p.playerId}`}
              onChange={(e) =>
                record.mutate({ playerId: p.playerId, attended: e.target.checked })
              }
            />{" "}
            {name(p.names)}
          </span>
        </label>
      ))}
    </div>
  )
}
