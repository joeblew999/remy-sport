import { useSession, useSignOut } from "../lib/session";
import type { Route } from "../lib/router";
import { m } from "../lib/i18n";
import { useCan } from "../lib/data";
import { useState, useEffect } from "react";

/**
 * Who you are, and how to stop being them.
 *
 * The SPA had a login *route* before this and nothing that linked to it, so
 * sign-in was reachable only by typing `#/login` into the address bar. The
 * tests navigated by URL and passed, which is exactly how a feature can be
 * fully covered and completely unusable at the same time.
 *
 * Lives in the topbar because that is where the account control sits in the
 * harness too — the two GUIs should not disagree about where "sign out" is.
 */
/**
 * Two letters for an avatar, from a name or an address.
 *
 * Exported because the sidebar shows the same person at the same time, and two
 * implementations of "who is signed in" is how they came to disagree — it used
 * to render a hardcoded "SK / Coach Sukasem" beside this component's real name.
 */
export function initialsFor(label: string): string {
  return label
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

/**
 * @answers SIGN_IN_OUT, INSTALL_APP
 *
 * The other half — signing out.
 */
export function Account({ goto }: { goto: (r: Route) => void }) {
  const { user, loading } = useSession();
  const { data: canAdmin } = useCan("MANAGE_ALL_USERS");

  /**
   * Whether this browser can actually install the app, asked of the element.
   *
   * `<pwa-install>` knows three things a button cannot: whether the browser
   * fired `beforeinstallprompt`, whether the platform is one it can prompt on
   * at all, and whether the app is already installed and running standalone.
   * Reading them is what makes this offer honest rather than "always visible,
   * correct only sometimes" — which is the reason the old comment in topbar.tsx
   * gave for having no button, when the real answer was to ask.
   *
   * Polled once on mount rather than watched: the element sets these while it
   * initialises, and there is no event for "now installable". A reader who
   * arrives before the browser has decided sees no offer, and sees one on the
   * next page they open, which is the right way round — an offer that appears
   * under the cursor is worse than one that appears a moment late.
   */
  const [installable, setInstallable] = useState(false);
  useEffect(() => {
    const el = document.getElementById("pwa-install") as
      | { isInstallAvailable?: boolean; isUnderStandaloneMode?: boolean; showDialog?: (f?: boolean) => void }
      | null;
    const t = setTimeout(() => {
      setInstallable(Boolean(el?.isInstallAvailable) && !el?.isUnderStandaloneMode);
    }, 1000);
    return () => clearTimeout(t);
  }, []);
  const signOut = useSignOut();

  // Render nothing rather than a flash of "Sign in" that turns into a name a
  // moment later.
  if (loading) return <span className="account-slot" aria-busy="true" />;

  if (!user) {
    return (
      <button className="btn primary" data-testid="topbar-sign-in" onClick={() => goto({ page: "login" })}>
        {m.sign_in()}
      </button>
    );
  }

  const label = user.name || user.email;
  const initials = initialsFor(label);

  return (
    <div className="account-slot" data-testid="topbar-account">
      <div className="account-ava" aria-hidden="true">{initials}</div>
      <div className="account-meta">
        <div className="account-name" data-testid="topbar-user">{label}</div>
        {/* The platform role, not an org role — the two are different things
            (ADR 009), and this is the one that decides what you may do. */}
        {user.role && <div className="account-role" data-testid="topbar-role">{user.role}</div>}
      </div>
      {/* These three were English literals while every other string in the
          chrome was translated, so the topbar stayed in English on a Thai page —
          visible in the first screenshot run. The messages already existed and
          nothing called them. */}
      {/**
        * The way in to the admin console, which had none.
        *
        * `/#/admin` was reachable only by typing it. Nothing in the sidebar,
        * the topbar or any page linked to it — so the account list, the role
        * controls, approving a referee, deleting a team or a player and
        * creating an account were all built, enforced, and findable by somebody
        * who already knew the URL.
        *
        * Gated on the model's answer, not on `user.role === "admin"`. The
        * console itself asks `useCan("MANAGE_ALL_USERS")`, and a nav entry that
        * decided it differently is the second copy that keeps being the bug
        * here — a link to a page the API then refuses is a 403 with extra
        * steps.
        */}
      {/* Only where the element says installing is possible, and the app is not
          already installed. It prompted on arrival until a staging run could not
          click Sign out — see the note in main.tsx. */}
      {installable && (
        <button
          className="btn"
          data-testid="topbar-install"
          onClick={() =>
            (document.getElementById("pwa-install") as { showDialog?: (f?: boolean) => void } | null)
              ?.showDialog?.(true)
          }
        >
          {m.install_app()}
        </button>
      )}
      {canAdmin && (
        <button className="btn" data-testid="topbar-admin" onClick={() => goto({ page: "admin" })}>
          {m.nav_admin()}
        </button>
      )}
      <button className="btn" data-testid="topbar-devices" onClick={() => goto({ page: "devices" })}>
        {m.devices()}
      </button>
      <button className="btn" data-testid="topbar-sign-out" onClick={() => signOut.mutate()}>
        {m.sign_out()}
      </button>
    </div>
  );
}
