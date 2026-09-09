import { QueryError } from "../components/query-error";
import { useSession } from "../lib/session";
import { useDevices, useRevokeDevice } from "../lib/auth";
import { toDevices, formatWhen, type RawSession } from "../lib/devices";
import { parseRoute, signInRoute, routeHref } from "../lib/router";
import { m } from "../lib/i18n";
import { useLocale } from "../lib/locale";
import { PageHeader, PageInner, Row, RowGroup } from "../components/page";
import { EmptyState, Loading } from "../components/states";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "../components/button-link";
import { ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";

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
 *
 * Sessions and nothing else since 2026-09-09. The notification settings were
 * here too, and this page declared MANAGE_OWN_NOTIFICATION_CHANNELS although
 * the channel list that answers it is in notification-settings.tsx — the
 * declaration was carried by the page rather than by the code doing the work,
 * which sharing a page hid. Both moved to /#/notifications:
 * docs/2026-09-09-06-notifications-off-the-devices-page.md.
 */
export function DevicesPage() {
  const { locale } = useLocale();
  const { user, loading: sessionLoading } = useSession();
  // One query, two mutations. Invalidation refreshes the list, from lib/auth.ts.
  const q = useDevices();
  const revokeDevice = useRevokeDevice();
  const devices = q.data ? toDevices(q.data.sessions as RawSession[], q.data.currentToken) : null;
  const error = revokeDevice.error?.message ?? null;
  const busy = revokeDevice.isPending ? (revokeDevice.variables ?? null) : null;
  const revoke = (token: string) => revokeDevice.mutate(token);
  const revokeOthers = () => revokeDevice.mutate("others");

  if (sessionLoading) return <PageInner><Loading /></PageInner>;

  /**
   * Signed out: the sign-in prompt and nothing else. Every control on this
   * page needs a session; the notification settings were once rendered here
   * too, and an empty device list over a row of preference checkboxes under
   * "sign in to see your devices" was not worth the panel.
   */
  if (!user) {
    return (
      <PageInner>
        <EmptyState data-testid="devices-signed-out">
          <p>{m.sign_in_to_see_devices()}</p>
          <ButtonLink href={routeHref(signInRoute(parseRoute(window.location.hash)))}>
            {m.sign_in()}
          </ButtonLink>
        </EmptyState>
      </PageInner>
    );
  }

  const others = devices?.filter((d) => !d.current) ?? [];

  return (
    <div data-testid="devices-page">
      <PageHeader crumbs={[{ label: m.security() }]} title={m.signed_in_devices()} sub={m.sessions_note()} />
      <PageInner className="flex flex-col gap-6">
        <QueryError error={q.error} retry={q.refetch} pending={q.isFetching} />
        {error && (
          <Alert variant="destructive" data-testid="devices-error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {devices === null ? (q.isPending ? (
          <Loading>{m.loading_sessions()}</Loading>
        ) : null) : (
          <section className="flex flex-col gap-4">
            <RowGroup data-testid="devices-list">
              {devices.map((d) => (
                <Row key={d.id} data-testid={`device-${d.id}`}>
                  <ItemContent>
                    <ItemTitle>
                      {d.label}
                      {d.current && <Badge variant="secondary" data-testid="device-current">{m.this_device()}</Badge>}
                      {/* Worth surfacing: an admin viewing as you produces a real
                          session on your account, and you should be able to see it. */}
                      {d.impersonated && <Badge variant="outline" data-testid="device-impersonated">{m.admin_session()}</Badge>}
                    </ItemTitle>
                    {/* Place before time, and the address only as a fallback: a
                        person scanning this page is asking "was that me?", and
                        "Bangkok, TH · AIS Fibre" answers it where an IP never
                        does. The address stays reachable in the title for the
                        rare case where somebody genuinely needs it. */}
                    <ItemDescription title={d.ipAddress ?? undefined}>
                      {[
                        d.place ?? d.ipAddress ?? m.ip_not_recorded(),
                        m.last_active({ when: formatWhen(locale, d.lastSeen) }),
                      ].join(" · ")}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    {d.current ? (
                      <span className="text-sm text-muted-foreground">
                        {m.signed_in_when({ when: formatWhen(locale, d.createdAt) })}
                      </span>
                    ) : (
                      <Button
                        variant="outline"
                        data-testid={`revoke-${d.id}`}
                        disabled={busy === d.token}
                        onClick={() => void revoke(d.token)}
                      >
                        {busy === d.token ? m.signing_out() : m.sign_out()}
                      </Button>
                    )}
                  </ItemActions>
                </Row>
              ))}
            </RowGroup>

            {others.length > 0 && (
              <div>
                <Button
                  variant="outline"
                  data-testid="revoke-others"
                  disabled={busy === "others"}
                  onClick={() => void revokeOthers()}
                >
                  {busy === "others"
                    ? m.signing_out()
                    : m.sign_out_others({ count: others.length })}
                </Button>
              </div>
            )}
          </section>
        )}

        {/* The other device list is on its own page now, so this says which
            list that is. Here: where the account is signed in — a session,
            revocable. There: where a notification is delivered — a
            subscription, per browser. They genuinely diverge; a Mac has held a
            push subscription for an account it was signed out of. */}
        <p className="text-sm text-muted-foreground" data-testid="devices-notifications-link">
          {m.sessions_not_notifications()}{" "}
          <a className="underline underline-offset-4" href={routeHref({ page: "notifications" })} data-testid="to-notifications">
            {m.push_devices()}
          </a>
        </p>
      </PageInner>
    </div>
  );
}
