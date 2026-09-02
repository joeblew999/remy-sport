import { useSession } from "../lib/session";
import { useDevices, useRevokeDevice } from "../lib/auth";
import { toDevices, formatWhen, type RawSession } from "../lib/devices";
import type { Route } from "../lib/router";
import { m } from "../lib/i18n";
import { NotificationSettings } from "../components/notification-settings";
import { useLocale } from "../lib/locale";

/**
 * "Where am I signed in?" — ADR 014.
 *
 * Better Auth core has provided /list-sessions and /revoke-session all along;
 * nothing used them. This matters more since ADR 012 moved sessions to 30 days:
 * a long-lived session is a convenience while it is yours and a problem once it
 * is not, and the only way to end one was to wait a month.
 *
 * Not the multiSession plugin, which is account *switching* — a different
 * feature that would not answer this question.
 */
export function DevicesPage({ goto }: { goto: (r: Route) => void }) {
  const { locale } = useLocale();
  const { user, loading: sessionLoading } = useSession();
  // One query, two mutations. This was ~60 lines: a `useState` for the list, a
  // `useState` for the error, a `useState` for which row is busy, a `load`
  // callback, a `useEffect` to call it, and each write re-running `load()` by
  // hand. Invalidation does that now, from lib/auth.ts.
  const q = useDevices();
  const revokeDevice = useRevokeDevice();
  const devices = q.data ? toDevices(q.data.sessions as RawSession[], q.data.currentToken) : null;
  const error = q.error?.message ?? revokeDevice.error?.message ?? null;
  const busy = revokeDevice.isPending ? (revokeDevice.variables ?? null) : null;
  const revoke = (token: string) => revokeDevice.mutate(token);
  const revokeOthers = () => revokeDevice.mutate("others");


  if (sessionLoading) return <div className="empty">{m.loading()}</div>;

  /**
   * Signed out: the sign-in prompt and nothing else.
   *
   * The notification settings were rendered here too for a while, on the
   * argument that browser support and blocked permissions are facts about the
   * device worth knowing before signing in. As a reader sees it that is wrong —
   * an empty device list and a row of preference checkboxes under "sign in to
   * see your devices", none of it actionable until they do. Every control in
   * that section needs a session; the state alone was not worth the panel.
   */
  if (!user) {
    return (
      <div className="empty" data-testid="devices-signed-out">
        <p>{m.sign_in_to_see_devices()}</p>
        <button className="btn primary" onClick={() => goto({ page: "login" })}>
          {m.sign_in()}
        </button>
      </div>
    );
  }

  const others = devices?.filter((d) => !d.current) ?? [];

  return (
    <div className="page-inner" data-testid="devices-page">
      <div className="page-header">
        <div className="crumbs">{m.security()}</div>
        <h1>{m.signed_in_devices()}</h1>
        <div className="sub">
          {m.sessions_note()}
        </div>
      </div>

      {error && (
        <div className="empty" data-testid="devices-error">
          <p>{error}</p>
        </div>
      )}

      {devices === null ? (
        <div className="empty">{m.loading_sessions()}</div>
      ) : (
        <>
          <div className="dash-card" data-testid="devices-list">
            {devices.map((d) => (
              <div key={d.id} className="device-row" data-testid={`device-${d.id}`}>
                <div>
                  <div className="device-label">
                    {d.label}
                    {d.current && (
                      <span className="device-tag" data-testid="device-current">
                        {m.this_device()}
                      </span>
                    )}
                    {/* Worth surfacing: an admin viewing as you produces a real
                        session on your account, and you should be able to see it. */}
                    {d.impersonated && (
                      <span className="device-tag warn" data-testid="device-impersonated">
                        {m.admin_session()}
                      </span>
                    )}
                  </div>
                  {/* Place before time, and the address only as a fallback: a
                      person scanning this page is asking "was that me?", and
                      "Bangkok, TH · AIS Fibre" answers it where an IP never
                      does. The address stays reachable in the title for the
                      rare case where somebody genuinely needs it. */}
                  <div className="device-meta" title={d.ipAddress ?? undefined}>
                    {[
                      d.place ?? d.ipAddress ?? m.ip_not_recorded(),
                      m.last_active({ when: formatWhen(locale, d.lastSeen) }),
                    ].join(" · ")}
                  </div>
                </div>
                {d.current ? (
                  <span className="device-meta">
                    {m.signed_in_when({ when: formatWhen(locale, d.createdAt) })}
                  </span>
                ) : (
                  <button
                    className="btn"
                    data-testid={`revoke-${d.id}`}
                    disabled={busy === d.token}
                    onClick={() => void revoke(d.token)}
                  >
                    {busy === d.token ? m.signing_out() : m.sign_out()}
                  </button>
                )}
              </div>
            ))}
          </div>

          {others.length > 0 && (
            <div className="event-actions" style={{ marginTop: 16 }}>
              <button
                className="btn"
                data-testid="revoke-others"
                disabled={busy === "others"}
                onClick={() => void revokeOthers()}
              >
                {busy === "others"
                  ? m.signing_out()
                  : `Sign out all other devices (${others.length})`}
              </button>
            </div>
          )}
        </>
      )}

      {/*
        The other device list, deliberately on the same page.

        These two were in different places and both said "this device", which is
        how a reader ends up certain they are looking at one list. They are not
        the same thing and they genuinely diverge — measured on 2026-09-02, a Mac
        held a push subscription for an account it was signed OUT of, while a
        signed-in iPhone had no push registration at all.

        Above: where you are signed in — a session, revocable.
        Below: where notifications are delivered — a subscription, per browser.

        Adjacent, the difference is visible. Apart, it is a coincidence of
        wording nobody can be expected to notice.
      */}
      <NotificationSettings />
    </div>
  );
}
