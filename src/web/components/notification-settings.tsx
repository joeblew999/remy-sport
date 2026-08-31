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
import { disablePush, enableNative, enablePush, pushState, type PushState } from "../lib/push"

/**
 * The types worth offering, not all fourteen.
 *
 * NOTIFICATION_TYPE has fourteen entries and only these have anything that
 * sends them today. Listing the rest would be a settings page full of switches
 * that do nothing — which teaches a reader that the switches do not work.
 *
 * ## It drifted, and now a check holds it
 *
 * This said "each one is added here as its trigger is written", and then two
 * triggers were written and not added: `EVENT_REMINDER` sends from the cron in
 * src/scheduled.ts and `ROSTER_CHANGE` from src/api/registrations.ts, and
 * neither could be muted by anyone. `push.ts` honours a preference row for any
 * type — there was simply no way to create one for these two, so the settings
 * page quietly became a partial list of what the platform sends you.
 *
 * A comment asking to be remembered is not a mechanism.
 * `mise run check:notifications` compares this list against every `typeCode:`
 * the Worker actually sends, in both directions, and fails on either kind of
 * drift.
 */
const OFFERED = [
  "MATCH_START",
  "SCORE_UPDATE",
  "MATCH_END",
  "EVENT_REMINDER",
  "ROSTER_CHANGE",
] as const

export function NotificationSettings() {
  const qc = useQueryClient()
  const { locale, label, name, describe } = useLocale()
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
  const { data: devices } = useQuery(orpc.notifications.devices.queryOptions())

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

      {/*
        The native app, which used to land in "this browser cannot show
        notifications" — true of PushManager, false of the machine. It says what
        native actually offers and, more importantly, what it does not: nothing
        arrives while the app is closed, because there is no APNs or FCM
        registration by decision (docs/dev/native-notifications.md). The reader
        is pointed at the installed PWA, which does work closed.
      */}
      {state?.status === "native" || state?.status === "native-off" || state?.status === "native-denied" ? (
        <div data-testid="push-native">
          {state.status === "native-denied" ? (
            <div className="empty" data-testid="push-native-denied">{m.push_native_denied()}</div>
          ) : state.status === "native" ? (
            <div className="meta" data-testid="push-native-on">{m.push_native_on()}</div>
          ) : (
            <button
              type="button"
              className="btn"
              disabled={busy}
              data-testid="push-native-enable"
              onClick={() => {
                setBusy(true)
                void enableNative()
                  .then(setState)
                  .finally(() => setBusy(false))
              }}
            >
              {m.push_native_enable()}
            </button>
          )}
          {/* Shown in every native state, including denied: it is the answer to
              "why did nothing arrive overnight", which is the question a reader
              has regardless of whether they granted permission. */}
          <p className="meta" data-testid="push-native-limit">{m.push_native_limit()}</p>
        </div>
      ) : state === null ? null : state.status === "on" || state.status === "off" ? (
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
              {/* And the model's own explanation of what it sends. "Score
                  Update" is two words that could mean a push on every basket
                  or one at full time; "Score changed during a live match" is
                  the answer, and it has been in the fixtures in three
                  languages the whole time. */}
              {describe("notificationTypes", code) && (
                <div className="pref-note" data-testid={`pref-note-${code}`}>
                  {describe("notificationTypes", code)}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {/* Which browsers are actually registered.
          `notifications.devices` existed and no screen called it, so the one
          question a person asks when a notification does not arrive — "is this
          browser even signed up?" — had no answer anywhere in the app. The
          endpoint deliberately never returns the push endpoint itself: it is a
          bearer capability, and anyone holding it can push to that browser. */}
      <h3>{m.push_devices()}</h3>
      {devices?.devices.length ? (
        <ul className="pref-list" data-testid="device-list">
          {devices.devices.map((d, i) => (
            <li key={`${d.label}-${i}`} data-testid={`device-${i}`}>
              {d.label}
              {/* A registered-but-disabled browser is a real state and the
                  reason nothing arrives on it. Silence with no explanation is
                  what makes people conclude push is broken. */}
              {!d.enabled && <span className="meta"> · {m.device_off()}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty" data-testid="devices-empty">{m.devices_none()}</div>
      )}

      <h3>{m.following_label()}</h3>
      {data?.following.length ? (
        <ul className="pref-list" data-testid="following-list">
          {data.following.map((f) => (
            <li key={`${f.objectTypeCode}:${f.objectId}`}>
              {/* The thing's own name, in the reader's language — "Assumption
                  College U16 Boys", not "Team". A list of type labels reads as
                  "Team, Team, Team" and is not one anybody can act on. */}
              {name(f.names, f.name) || label("objectTypes", f.objectTypeCode)}
              <span className="meta"> · {label("objectTypes", f.objectTypeCode)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty">{m.nothing_followed_yet()}</div>
      )}
    </section>
  )
}
