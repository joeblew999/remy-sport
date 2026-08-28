/**
 * Notification settings: turn push on for this device, then choose what it is
 * worth being woken for.
 *
 * The order matters. The switch comes first because nothing below it does
 * anything until push is on, and the type list is disabled rather than hidden
 * while it is off — hiding it would make the page look like it has fewer
 * settings than it does, and a reader who turns push on then wonders where the
 * rest went.
 *
 * Every unavailable state gets its own sentence. See lib/push.ts: "you must
 * install this app first" and "you blocked notifications" are different
 * problems with different fixes, and one generic "notifications are off" would
 * leave an iPhone reader pressing a button that cannot work.
 */

import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, orpc } from "../lib/orpc"
import { m } from "../../paraglide/messages.js"
import { useLocale } from "../lib/locale"
import { disablePush, enablePush, pushState, type PushState } from "../lib/push"

/**
 * The types worth offering, not all fourteen.
 *
 * NOTIFICATION_TYPE has fourteen entries and only these three have anything
 * that sends them today. Listing the rest would be a settings page full of
 * switches that do nothing — which teaches a reader that the switches do not
 * work. Each one is added here as its trigger is written.
 */
const OFFERED = ["MATCH_START", "SCORE_UPDATE", "MATCH_END"] as const

export function NotificationSettings() {
  const qc = useQueryClient()
  const { locale, label } = useLocale()
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    void pushState().then((s) => {
      if (live) setState(s)
    })
    return () => {
      live = false
    }
  }, [])

  const { data } = useQuery(orpc.notifications.following.queryOptions())

  const mute = useMutation({
    mutationFn: (args: { notificationTypeCode: (typeof OFFERED)[number]; isEnabled: boolean }) =>
      api.notifications.setPreference(args),
    onSuccess: () => qc.invalidateQueries({ queryKey: orpc.notifications.following.key() }),
  })

  const test = useMutation({
    mutationFn: () => api.notifications.sendTest({ locale: locale as "en" }),
  })

  const toggle = async () => {
    setBusy(true)
    try {
      setState(state?.status === "on" ? await disablePush() : await enablePush(locale))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="admin-card" data-testid="notification-settings">
      <h2>{m.notifications()}</h2>
      <p className="meta">{m.notifications_intro()}</p>

      {state === null ? null : state.status === "on" || state.status === "off" ? (
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => void toggle()}
          data-testid="push-toggle"
        >
          {state.status === "on" ? m.disable_notifications() : m.enable_notifications()}
        </button>
      ) : (
        <div className="empty" data-testid="push-blocked">
          {state.status === "needs-install"
            ? m.push_needs_install()
            : state.status === "denied"
              ? m.push_denied()
              : state.status === "not-configured"
                ? m.push_not_configured()
                : m.push_unsupported()}
        </div>
      )}

      {state?.status === "on" && (
        <>
          <div className="meta" data-testid="push-on-here">
            {m.notifications_on_here()}
          </div>
          {/* The only end-to-end check that exists. Whether a notification
              actually appears depends on the push service, the OS and any Focus
              mode — none of which we can see, and none of which a test suite
              can stand in for. So the reader presses it and looks. */}
          <button
            type="button"
            className="btn"
            disabled={test.isPending}
            onClick={() => test.mutate()}
            data-testid="push-test"
          >
            {m.send_test_notification()}
          </button>
          {test.data && (
            <div className="meta" data-testid="push-test-result">
              {m.test_sent_to_devices({ count: test.data.sent })}
            </div>
          )}
        </>
      )}

      <h3>{m.what_to_hear_about()}</h3>
      <ul className="pref-list">
        {OFFERED.map((code) => {
          const muted = data?.muted.includes(code) ?? false
          return (
            <li key={code}>
              <label>
                <input
                  type="checkbox"
                  checked={!muted}
                  // Off until push is on: a switch that changes a stored
                  // preference nothing will read is a lie about what it does.
                  disabled={state?.status !== "on" || mute.isPending}
                  onChange={(e) =>
                    mute.mutate({ notificationTypeCode: code, isEnabled: e.target.checked })
                  }
                  data-testid={`pref-${code}`}
                />
                {/* The model's own name for the type, in the reader's language.
                    Writing these as UI copy would be a second set of names for
                    the PO's list to drift from. */}
                {label("notificationTypes", code)}
              </label>
            </li>
          )
        })}
      </ul>

      <h3>{m.following_label()}</h3>
      {data?.following.length ? (
        <ul className="pref-list" data-testid="following-list">
          {data.following.map((f) => (
            <li key={`${f.objectTypeCode}:${f.objectId}`}>
              {label("objectTypes", f.objectTypeCode)}
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty">{m.nothing_followed_yet()}</div>
      )}
    </section>
  )
}
