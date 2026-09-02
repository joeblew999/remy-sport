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

import { useCallback, useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, orpc } from "../lib/orpc"
import { m } from "../../paraglide/messages.js"
import { useLocale } from "../lib/locale"
import { useSession } from "../lib/session"
import { useRouter } from "../lib/router"
import { PushFailure, currentDeviceId, disablePush, enableNative, enablePush, pushState, type PushState } from "../lib/push"

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
  const { user } = useSession()
  /**
   * The tapped notification came back here and said so.
   *
   * This is the last link in the chain and the only one the reader could not
   * previously observe: the test notification opened `#/profile`, the page they
   * pressed the button on, so a working tap and a broken one were identical.
   */
  const { route, setParam } = useRouter()
  const tapped = route.query?.pushtest
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  /**
   * The fingerprint of this browser's own subscription, matched against the
   * server's list below. Recomputed when the push state changes, because
   * turning notifications on is exactly when it stops being null.
   */
  const [thisDevice, setThisDevice] = useState<string | null>(null)

  /**
   * Ask what the state is. Also the retry, which is why it is a callback.
   *
   * No `.catch`: `pushState` never rejects and reports a failure to find out as
   * `unknown` — see the contract on it. It used to reject here, `state` stayed
   * null, and null renders this whole section as nothing.
   */
  const check = useCallback(() => {
    setState(null)
    void pushState().then(setState)
  }, [])

  useEffect(() => {
    let live = true
    void pushState().then((s) => {
      if (live) setState(s)
    })
    return () => {
      live = false
    }
  }, [])

  // Guarded like everything else here: no route may leave a promise rejecting,
  // and `currentDeviceId` is called on a page the render tier loads with no
  // server at all.
  useEffect(() => {
    let live = true
    void currentDeviceId()
      .then((id) => {
        if (live) setThisDevice(id)
      })
      .catch(() => {
        /* cannot identify this browser: the list simply marks nothing */
      })
    return () => {
      live = false
    }
  }, [state?.status])

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

  /**
   * Turning it on or off, and saying so when it does not work.
   *
   * `try/finally` with no catch, and the caller is `void toggle()` — so a throw
   * from enablePush left `state` untouched, rendered nothing, and became an
   * unhandled rejection. Pressing "Turn on notifications" appeared to do
   * nothing at all. Three things in that path can throw, and the one that
   * actually does is `notifications.subscribe`, which is `authed`.
   */
  const [toggleFailed, setToggleFailed] = useState<"subscribe" | "register" | "unknown" | null>(null)
  const toggle = async () => {
    setBusy(true)
    setToggleFailed(null)
    try {
      setState(state?.status === "on" ? await disablePush() : await enablePush(locale))
    } catch (e) {
      /**
       * The raw error, always, where a person can read it.
       *
       * Safari refuses a subscription with a bare `AbortError` carrying no
       * detail, and the first version of this printed one guessed sentence for
       * every cause — "if you have been signed out" — to a reader who was
       * signed in. A wrong explanation is worse than none: it sends somebody to
       * check the thing that was fine.
       */
      console.error("notifications: could not switch on", e)
      setToggleFailed(e instanceof PushFailure ? e.step : "unknown")
      // Re-read rather than assume: enablePush rolls the browser half back on
      // failure, so the truthful state is whatever it left behind.
      setState(await pushState())
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
            <div className="push-note is-blocked" data-testid="push-native-denied">{m.push_native_denied()}</div>
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
      ) : state === null ? (
        // Distinct from `unknown` on purpose: a slow network reads as waiting,
        // a failed one reads as failed. Rendering nothing for both is what made
        // a failure look like a section that does not exist.
        <div className="meta" data-testid="push-checking">{m.push_checking()}</div>
      ) : state.status === "unknown" ? (
        <div className="push-note" data-testid="push-unknown">
          <span>{m.push_unknown()}</span>{" "}
          <button type="button" className="btn" data-testid="push-retry" onClick={check}>
            {m.push_retry()}
          </button>
        </div>
      ) : state.status === "on" || state.status === "off" ? (
        <>
          {/*
            Registering a browser is `authed`, so without a session this button
            can only 401 — which it did, three separate ways, before any of them
            said so. The push STATE above stays visible either way: permission,
            support and installedness are facts about this device and are worth
            knowing signed out. It is the actions that need somebody to act as.
          */}
          {user ? (
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
            <div className="push-note" data-testid="push-signed-out">
              {m.push_needs_sign_in()}
            </div>
          )}
          {toggleFailed && (
            <div className="push-note is-blocked" data-testid="push-toggle-error">
              {toggleFailed === "subscribe"
                ? m.push_subscribe_refused()
                : toggleFailed === "register"
                  ? m.push_register_failed()
                  : m.push_toggle_failed()}
            </div>
          )}
        </>
      ) : (
        <div className="push-note is-blocked" data-testid="push-blocked">
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
          {/*
            "On for this device" used to be rendered here, below a button that
            already read "Turn off on this device" — the verb after the fact it
            was derived from, saying the same thing twice. The button is the
            state; a second line restating it is one more thing to read and one
            more thing that can disagree.

            What this device IS gets said once more, and usefully: in the list
            below, where the row is marked "· this device" beside the browsers
            that are not. That is the same fact where it can be compared.
          */}
          {/* The only end-to-end check that exists. Whether a notification
              actually appears depends on the push service, the OS and any Focus
              mode — none of which we can see, and none of which a test suite
              can stand in for. So the reader presses it and looks. */}
          {user ? (
            <button
              type="button"
              className="btn"
              disabled={test.isPending}
              onClick={() => test.mutate()}
              data-testid="push-test"
            >
              {m.send_test_notification()}
            </button>
          ) : (
            // The endpoint is `authed`, and this whole block is reachable
            // signed out. Offering the button anyway is what produced a click
            // that could only ever be refused.
            <div className="push-note" data-testid="push-test-signed-out">
              {m.test_needs_sign_in()}
            </div>
          )}
          {/*
            What actually became of it, rather than one number.

            This rendered `sent` alone, so a push the service REFUSED and a
            reader with no devices produced the same sentence — "Sent to 0
            device(s)" — followed by a guess that it was "blocked at the system
            level", which is the one cause we can be sure it is not when the
            send never left. Four outcomes, four answers, worst first.
          */}
          {/*
            A failed send said NOTHING. Only `test.data` was rendered, so a
            request the Worker refused — a lapsed session being the easy way in,
            since pushState() reads "on" from a local subscription and
            notifications.key is public, so this button renders while signed
            out — left the button looking inert. "I pressed it and nothing
            happened" was literally true, and the page was the reason.
          */}
          {/*
            Proof of the last step, which nothing else can give.

            Delivery is observable — a card appears. The TAP was not: it landed
            on the page it started from. This is set by the query the service
            worker navigated to, so seeing it means the notification arrived AND
            the click reached the app.
          */}
          {tapped && (
            <div className="push-note" data-testid="push-test-tapped">
              <span>{m.test_tap_confirmed()}</span>{" "}
              <button
                type="button"
                className="btn"
                data-testid="push-test-tapped-clear"
                onClick={() => setParam("pushtest", null)}
              >
                {m.dismiss()}
              </button>
            </div>
          )}
          {test.isError && (
            <div className="push-note is-blocked" data-testid="push-test-error">
              {m.test_failed()}
            </div>
          )}
          {test.data && (
            <div className="push-note" data-testid="push-test-result">
              {!test.data.configured
                ? m.test_not_configured()
                : test.data.failed > 0
                  ? m.test_refused({ count: test.data.failed })
                  : test.data.gone > 0 && test.data.sent === 0
                    ? m.test_all_expired({ count: test.data.gone })
                    : test.data.sent === 0
                      ? m.test_no_devices()
                      : m.test_sent_to_devices({ count: test.data.sent })}
            </div>
          )}
        </>
      )}

      {/* Which browsers are actually registered.
          `notifications.devices` existed and no screen called it, so the one
          question a person asks when a notification does not arrive — "is this
          browser even signed up?" — had no answer anywhere in the app. The
          endpoint deliberately never returns the push endpoint itself: it is a
          bearer capability, and anyone holding it can push to that browser. */}
      <h3>{m.push_devices()}</h3>
      {/*
        The device you are sitting at, named as such.

        A list of labels cannot answer the question it is there to answer. On
        macOS a web app added to the Dock has its own storage — so its own
        service worker registration and its own subscription — and a reader
        inside the installed app saw "Safari on Mac" and read it as themselves.
        It was a different browser, and every test they sent went to it.
      */}
      {devices?.devices.length ? (
        <ul className="pref-list" data-testid="device-list">
          {devices.devices.map((d, i) => (
            <li key={d.id || `${d.label}-${i}`} data-testid={`device-${i}`}>
              {d.label}
              {thisDevice && d.id === thisDevice && (
                <span className="device-here" data-testid={`device-${i}-here`}>
                  {m.device_this_one()}
                </span>
              )}
              {/* A registered-but-disabled browser is a real state and the
                  reason nothing arrives on it. Silence with no explanation is
                  what makes people conclude push is broken. */}
              {!d.enabled && <span className="meta"> · {m.device_off()}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <div className="push-note" data-testid="devices-empty">{m.devices_none()}</div>
      )}
      {/*
        This browser holds a subscription the server has no row for.

        `pushState()` reports "on" from the local subscription alone, and
        `deliverPush` deletes a row on a 410 — so a pruned device shows a
        Disable button and a working-looking test button forever, and nothing
        can ever reach it. This is the only place the two views are compared.
      */}
      {thisDevice && devices && !devices.devices.some((d) => d.id === thisDevice) && (
        <div className="push-note is-blocked" data-testid="device-not-registered">
          {m.device_not_registered()}
        </div>
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
        <div className="push-note">{m.nothing_followed_yet()}</div>
      )}
    </section>
  )
}
