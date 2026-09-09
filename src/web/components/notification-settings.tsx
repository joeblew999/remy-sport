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
 * **Mounted only behind a session.** Every action here — registering a browser,
 * unregistering it, sending a test — is `authed`. Its only caller is the
 * signed-in branch of /#/notifications. Mount it anywhere public and the
 * buttons will 401 in silence.
 *
 * No card header: the page supplies the title, and this carried one saying the
 * same thing. It was a section on /#/devices until 2026-09-09 and is the
 * substance of its own page now —
 * docs/done/2026-09-09-06-notifications-off-the-devices-page.md.
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
import { useRouter } from "../lib/router"
import { PushFailure, currentDeviceId, disablePush, enableNative, enablePush, pushState, type PushState } from "../lib/push"
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { NOTIFICATION_CATEGORY, NOTIFICATION_TYPE } from "../../domain/vocabularies"
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import { Muted, SubHeading } from "./page"

/**
 * The types worth offering, not all fourteen.
 *
 * NOTIFICATION_TYPE has fourteen entries and only these have anything that
 * sends them today. Listing the rest would be a settings page full of switches
 * that do nothing — which teaches a reader that the switches do not work.
 * `tests/repo/notifications.test.ts` compares this list against every type the
 * Worker actually sends, in both directions, and fails on either kind of
 * drift.
 */
const OFFERED = [
  "MATCH_START",
  "SCORE_UPDATE",
  "MATCH_END",
  "EVENT_REMINDER",
  "ROSTER_CHANGE",
] as const

/**
 * Which channels each type is offered on, because a renderer exists for it.
 *
 * `ROSTER_CHANGE` has no EMAIL renderer — src/api/registrations.ts says so
 * deliberately, and the Product Owner's decision of 2026-09-09 was to stop
 * offering the cell rather than write the copy. Offering it wrote a preference
 * row nothing would ever read: a control that does nothing, which is precisely
 * what tests/repo/notifications.test.ts exists to prevent, one dimension along.
 * That check now compares (type, channel) pairs, so this table cannot drift
 * from what the Worker can actually send.
 */
const CHANNELS_FOR: Record<(typeof OFFERED)[number], readonly ("PUSH" | "EMAIL")[]> = {
  MATCH_START: ["PUSH", "EMAIL"],
  SCORE_UPDATE: ["PUSH", "EMAIL"],
  MATCH_END: ["PUSH", "EMAIL"],
  EVENT_REMINDER: ["PUSH", "EMAIL"],
  ROSTER_CHANGE: ["PUSH"],
}

/** The offered types under the model's own categories, in the model's order. */
const GROUPS = NOTIFICATION_CATEGORY.map((category) => ({
  code: category.code,
  types: OFFERED.filter((t) => NOTIFICATION_TYPE.find((n) => n.code === t)?.categoryCode === category.code),
})).filter((g) => g.types.length > 0)

/** A note the reader cannot act on from here: a state, not an error to fix. */
function Note({ blocked, children, ...props }: { blocked?: boolean; children: React.ReactNode; "data-testid"?: string }) {
  return (
    <Alert variant={blocked ? "destructive" : "default"} {...props}>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  )
}

/**
 * @answers RECEIVE_NOTIFICATIONS, RECEIVE_PLAYER_NOTIFICATIONS, RECEIVE_TEAM_NOTIFICATIONS, RECEIVE_EVENT_NOTIFICATIONS, MANAGE_OWN_NOTIFICATION_PREFERENCES, MANAGE_OWN_NOTIFICATION_CHANNELS
 *
 * What you are told about, and how. The per-object ones are preferences on
 * what you already follow, which is why they are here and not on the follow
 * button.
 *
 * `MANAGE_OWN_NOTIFICATION_CHANNELS` — add, remove, verify, enable, disable a
 * channel — was declared on pages/devices.tsx while this sat inside it. The
 * channels are the browser list and the email address below, both here, so the
 * declaration is here.
 */
export function NotificationSettings() {
  const qc = useQueryClient()
  const { locale, label, describe } = useLocale()
  /**
   * The tapped notification came back here and said so. This is the last link
   * in the chain and the only one the reader could not previously observe.
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
   * No `.catch`: `pushState` never rejects and reports a failure to find out as
   * `unknown` — see the contract on it.
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
  /**
   * Can push reach this *account* at all — not this browser.
   *
   * `userNotificationPreference` is keyed on the user and `audienceFor` reads it
   * for every device they have, so the preference list is an account fact. It
   * used to be gated on `state.status === "on"`, which is this browser's own
   * subscription, and that froze the whole list on a laptop for a reader whose
   * phone was registered — and permanently inside the native app, where the
   * status is `native` and never `on`. `state` still governs this device's own
   * controls, which is the only thing it actually knows about.
   */
  const pushReachable = (devices?.devices ?? []).some((d) => d.enabled)

  const mute = useMutation({
    mutationFn: (args: { notificationTypeCode: (typeof OFFERED)[number]; isEnabled: boolean; channelCode?: "PUSH" | "EMAIL" }) =>
      api.notifications.setPreference(args),
    onSuccess: () => qc.invalidateQueries({ queryKey: orpc.notifications.following.key() }),
  })

  const test = useMutation({
    mutationFn: () => api.notifications.sendTest({ locale: locale as "en" }),
  })

  /**
   * Turning it on or off, and saying so when it does not work. Three things in
   * that path can throw, and the one that actually does is
   * `notifications.subscribe`, which is `authed`.
   */
  const [toggleFailed, setToggleFailed] = useState<"subscribe" | "register" | "unknown" | null>(null)
  const toggle = async () => {
    setBusy(true)
    setToggleFailed(null)
    try {
      setState(state?.status === "on" ? await disablePush() : await enablePush(locale))
    } catch (e) {
      // The raw error, always, where a person can read it. Safari refuses a
      // subscription with a bare `AbortError` carrying no detail, and a wrong
      // explanation is worse than none.
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
    <Card data-testid="notification-settings">
      <CardContent className="flex flex-col gap-4">

      {/* The native app, which used to land in "this browser cannot show
          notifications" — true of PushManager, false of the machine. It says
          what native actually offers and what it does not: nothing arrives
          while the app is closed (docs/dev/native-notifications.md). */}
      {state?.status === "native" || state?.status === "native-off" || state?.status === "native-denied" ? (
        <div className="flex flex-col gap-3" data-testid="push-native">
          {state.status === "native-denied" ? (
            <Note blocked data-testid="push-native-denied">{m.push_native_denied()}</Note>
          ) : state.status === "native" ? (
            <Muted data-testid="push-native-on">{m.push_native_on()}</Muted>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="w-fit"
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
            </Button>
          )}
          {/* Shown in every native state, including denied: it is the answer to
              "why did nothing arrive overnight". */}
          <Muted data-testid="push-native-limit">{m.push_native_limit()}</Muted>
        </div>
      ) : state === null ? (
        // Distinct from `unknown` on purpose: a slow network reads as waiting,
        // a failed one reads as failed.
        <Muted data-testid="push-checking">{m.push_checking()}</Muted>
      ) : state.status === "unknown" ? (
        <Alert data-testid="push-unknown">
          <AlertDescription>{m.push_unknown()}</AlertDescription>
          <AlertAction>
            <Button type="button" variant="outline" size="sm" data-testid="push-retry" onClick={check}>
              {m.push_retry()}
            </Button>
          </AlertAction>
        </Alert>
      ) : state.status === "on" || state.status === "off" ? (
        <>
          <Button
            type="button"
            className="w-fit"
            disabled={busy}
            onClick={() => void toggle()}
            data-testid="push-toggle"
          >
            {state.status === "on" ? m.disable_notifications() : m.enable_notifications()}
          </Button>
          {toggleFailed && (
            <Note blocked data-testid="push-toggle-error">
              {toggleFailed === "subscribe"
                ? m.push_subscribe_refused()
                : toggleFailed === "register"
                  ? m.push_register_failed()
                  : m.push_toggle_failed()}
            </Note>
          )}
        </>
      ) : (
        <Note blocked data-testid="push-blocked">
          {state.status === "needs-install"
            ? m.push_needs_install()
            : state.status === "denied"
              ? m.push_denied()
              : state.status === "not-configured"
                ? m.push_not_configured()
                : m.push_unsupported()}
        </Note>
      )}

      {state?.status === "on" && (
        <>
          {/* The only end-to-end check that exists. Whether a notification
              actually appears depends on the push service, the OS and any Focus
              mode — none of which we can see. So the reader presses it and looks. */}
          <Button
            type="button"
            variant="outline"
            className="w-fit"
            disabled={test.isPending}
            onClick={() => test.mutate()}
            data-testid="push-test"
          >
            {m.send_test_notification()}
          </Button>
          {/* Proof of the last step: set by the query the service worker
              navigated to, so seeing it means the notification arrived AND the
              click reached the app. */}
          {tapped && (
            <Alert data-testid="push-test-tapped">
              <AlertDescription>{m.test_tap_confirmed()}</AlertDescription>
              <AlertAction>
                <Button type="button" variant="outline" size="sm" data-testid="push-test-tapped-clear" onClick={() => setParam("pushtest", null)}>
                  {m.dismiss()}
                </Button>
              </AlertAction>
            </Alert>
          )}
          {test.isError && <Note blocked data-testid="push-test-error">{m.test_failed()}</Note>}
          {test.data && (
            <Note data-testid="push-test-result">
              {!test.data.configured
                ? m.test_not_configured()
                : test.data.failed > 0
                  ? m.test_refused({ count: test.data.failed })
                  : test.data.gone > 0 && test.data.sent === 0
                    ? m.test_all_expired({ count: test.data.gone })
                    : test.data.sent === 0
                      ? m.test_no_devices()
                      : m.test_sent_to_devices({ count: test.data.sent })}
            </Note>
          )}
        </>
      )}

      {/* Which browsers are actually registered — the one question a person
          asks when a notification does not arrive. The endpoint never returns
          the push endpoint itself: it is a bearer capability. The device you
          are sitting at is named as such, because on macOS a web app added to
          the Dock has its own subscription and a reader inside the installed
          app saw "Safari on Mac" and read it as themselves. */}
      <section className="flex flex-col gap-2">
        <SubHeading>{m.notifications_where()}</SubHeading>
        {devices?.devices.length ? (
          <ItemGroup data-testid="device-list">
            {devices.devices.map((d, i) => (
              <Item variant="outline" key={d.id || `${d.label}-${i}`} size="sm" data-testid={`device-${i}`}>
                <ItemContent>
                  <ItemTitle>
                    {d.label}
                    {thisDevice && d.id === thisDevice && (
                      <Badge variant="secondary" data-testid={`device-${i}-here`}>{m.device_this_one()}</Badge>
                    )}
                  </ItemTitle>
                  {/* A registered-but-disabled browser is a real state and the
                      reason nothing arrives on it. */}
                  {!d.enabled && <ItemDescription>{m.device_off()}</ItemDescription>}
                </ItemContent>
              </Item>
            ))}
          </ItemGroup>
        ) : (
          <Note data-testid="devices-empty">{m.devices_none()}</Note>
        )}
        {/*
          Email, as the row it is.

          It was one grey sentence filed under *What to hear about*, which is a
          different question — that section asks what, this one asks where. The
          address is a delivery destination exactly as a browser is, so it sits
          with them and keeps its three states as a row rather than a caption.
        */}
        <ItemGroup data-testid="email-channel-row">
          <Item variant="outline" size="sm">
            <ItemContent>
              <ItemTitle>{label("notificationChannels", "EMAIL")}</ItemTitle>
              <ItemDescription>
                {!data?.email
                  ? m.email_row_none()
                  : data.email.verified
                    ? m.email_goes_to({ address: data.email.address })
                    : m.email_unverified()}
              </ItemDescription>
            </ItemContent>
            {data?.email?.verified && (
              <ItemActions>
                <Badge variant="secondary" data-testid="email-verified">{m.verified()}</Badge>
              </ItemActions>
            )}
          </Item>
        </ItemGroup>
        {/* This browser holds a subscription the server has no row for: a
            pruned device shows a Disable button and a working-looking test
            button forever, and nothing can ever reach it. This is the only
            place the two views are compared. */}
        {thisDevice && devices && !devices.devices.some((d) => d.id === thisDevice) && (
          <Note blocked data-testid="device-not-registered">{m.device_not_registered()}</Note>
        )}
      </section>

      {/*
        One matrix: the types as rows, the two channels as columns.

        It was a checkbox that started ticked beside a switch that started off —
        the same question, asked twice, with two controls pointing two ways.
        The server's asymmetry is real and right (`wantsChannel` in api/push.ts:
        push is opt-out, email opt-in) but it is the server's, and a control
        that shows the reader's actual state says it either way. So both cells
        are the same control, and the channel is named once at the head of its
        column from the model's own vocabulary rather than on every row.

        Grouped by the model's categories, which it has carried all along.
        docs/2026-09-09-08-notifications-page-two-channels.md.
      */}
      <section className="flex flex-col gap-3">
        <SubHeading>{m.what_to_hear_about()}</SubHeading>

        {/* The column heads, and the one place a disabled column says why. */}
        <div className="grid grid-cols-[1fr_5rem_5rem] items-end gap-2 border-b pb-2">
          <span />
          <Muted as="span" className="text-center text-xs font-medium" data-testid="col-push">
            {label("notificationChannels", "PUSH")}
          </Muted>
          <Muted as="span" className="text-center text-xs font-medium" data-testid="col-email">
            {label("notificationChannels", "EMAIL")}
          </Muted>
        </div>
        {!pushReachable && (
          <Muted data-testid="push-column-off">{m.push_no_devices_note()}</Muted>
        )}
        {data && !data.email?.verified && (
          <Muted data-testid="email-state">
            {!data.email ? m.email_no_address() : m.email_unverified()}
          </Muted>
        )}

        {GROUPS.map((group) => (
          <FieldSet key={group.code} data-testid={`group-${group.code}`}>
            <FieldLegend variant="label">{label("notificationCategories", group.code)}</FieldLegend>
            <div className="flex flex-col">
              {group.types.map((code) => {
                const muted = data?.muted.includes(code) ?? false
                const emailOn = data?.emailOn.includes(code) ?? false
                const emailOffered = CHANNELS_FOR[code].includes("EMAIL")
                return (
                  <div key={code} className="grid grid-cols-[1fr_5rem_5rem] items-center gap-2 border-b py-2 last:border-b-0">
                    <Field orientation="vertical" className="gap-0.5">
                      <FieldLabel htmlFor={`pref-${code}`} className="font-normal">
                        {label("notificationTypes", code)}
                      </FieldLabel>
                      {describe("notificationTypes", code) && (
                        <FieldDescription data-testid={`pref-note-${code}`}>
                          {describe("notificationTypes", code)}
                        </FieldDescription>
                      )}
                    </Field>
                    <div className="flex justify-center">
                      <Switch
                        id={`pref-${code}`}
                        size="sm"
                        checked={!muted && pushReachable}
                        /* The account, not this browser. A preference is keyed
                           on the user and read for every device they have, so
                           gating it on this browser's own subscription froze
                           the list on a laptop for a reader whose phone was
                           registered — and permanently in the native app,
                           where the status is never "on". */
                        disabled={!pushReachable || mute.isPending}
                        onCheckedChange={(checked) =>
                          mute.mutate({ notificationTypeCode: code, isEnabled: checked === true })
                        }
                        data-testid={`pref-${code}`}
                      />
                    </div>
                    <div className="flex justify-center">
                      {emailOffered ? (
                        <Switch
                          id={`email-pref-${code}`}
                          size="sm"
                          checked={emailOn}
                          disabled={!data?.email?.verified || mute.isPending}
                          onCheckedChange={(checked) =>
                            mute.mutate({ notificationTypeCode: code, channelCode: "EMAIL", isEnabled: checked === true })
                          }
                          data-testid={`email-pref-${code}`}
                        />
                      ) : (
                        /* Empty with its reason, not a live control that stores
                           a preference nothing reads. */
                        <Muted as="span" className="text-xs" data-testid={`email-none-${code}`}>
                          {m.channel_push_only()}
                        </Muted>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </FieldSet>
        ))}
      </section>
      </CardContent>
    </Card>
  )
}
