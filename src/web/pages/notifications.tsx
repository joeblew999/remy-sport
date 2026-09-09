import { useSession } from "../lib/session";
import { parseRoute, signInRoute, routeHref } from "../lib/router";
import { m } from "../lib/i18n";
import { NotificationSettings } from "../components/notification-settings";
import { Muted, PageHeader, PageInner } from "../components/page";
import { EmptyState, Loading } from "../components/states";
import { ButtonLink } from "../components/button-link";

/**
 * "What am I told about, and how?"
 *
 * Split off /#/devices on 2026-09-09 — docs/2026-09-09-06-notifications-off-the-devices-page.md.
 * That page answers an authentication question (where am I signed in) and had
 * grown a second, unrelated one. Email settled it: an address is not a device,
 * so half the page was no longer described by its name.
 *
 * The header lives here rather than on the card, which had its own title and
 * would otherwise print "Notifications" twice on one screen.
 */
export function NotificationsPage() {
  const { user, loading } = useSession();

  if (loading) return <PageInner><Loading /></PageInner>;

  /**
   * Signed out: the prompt alone. Every control below is `authed` — registering
   * this browser, unregistering it, sending a test, storing a preference — and
   * a row of switches under "sign in first" is a page pretending to be usable.
   */
  if (!user) {
    return (
      <PageInner>
        <EmptyState data-testid="notifications-signed-out">
          <p>{m.sign_in_to_manage_notifications()}</p>
          <ButtonLink href={routeHref(signInRoute(parseRoute(window.location.hash)))}>
            {m.sign_in()}
          </ButtonLink>
        </EmptyState>
      </PageInner>
    );
  }

  return (
    <div data-testid="notifications-page">
      <PageHeader crumbs={[{ label: m.notifications() }]} title={m.notifications()} sub={m.notifications_intro()} />
      <PageInner className="flex flex-col gap-6">
        <NotificationSettings />
        {/* What adjacency used to do, said out loud instead.
            These two pages each hold a list of devices and they are not the
            same list: below is where a notification is delivered, a
            subscription per browser; the other is where the account is signed
            in, a session. While they shared a page a reader could see the
            difference; apart, the page has to name it. */}
        <Muted data-testid="notifications-sessions-link">
          {m.notifications_not_sessions()}{" "}
          <a className="underline underline-offset-4" href={routeHref({ page: "devices" })} data-testid="to-devices">
            {m.signed_in_devices()}
          </a>
        </Muted>
      </PageInner>
    </div>
  );
}
