import { useSession, useSignOut } from "../lib/session";
import type { Route } from "../lib/router";
import { m } from "../lib/i18n";

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

export function Account({ goto }: { goto: (r: Route) => void }) {
  const { user, loading } = useSession();
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
      <button className="btn" data-testid="topbar-devices" onClick={() => goto({ page: "devices" })}>
        {m.devices()}
      </button>
      <button className="btn" data-testid="topbar-sign-out" onClick={() => signOut.mutate()}>
        {m.sign_out()}
      </button>
    </div>
  );
}
