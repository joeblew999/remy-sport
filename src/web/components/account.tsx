import { useSession } from "../lib/session";
import type { Route } from "../lib/router";

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
export function Account({ goto }: { goto: (r: Route) => void }) {
  const { user, loading, signOut } = useSession();

  // Render nothing rather than a flash of "Sign in" that turns into a name a
  // moment later.
  if (loading) return <span className="account-slot" aria-busy="true" />;

  if (!user) {
    return (
      <button className="btn primary" data-testid="topbar-sign-in" onClick={() => goto({ page: "login" })}>
        Sign in
      </button>
    );
  }

  const label = user.name || user.email;
  const initials = label
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");

  return (
    <div className="account-slot" data-testid="topbar-account">
      <div className="account-ava" aria-hidden="true">{initials}</div>
      <div className="account-meta">
        <div className="account-name" data-testid="topbar-user">{label}</div>
        {/* The platform role, not an org role — the two are different things
            (ADR 009), and this is the one that decides what you may do. */}
        {user.role && <div className="account-role" data-testid="topbar-role">{user.role}</div>}
      </div>
      <button className="btn" data-testid="topbar-sign-out" onClick={() => void signOut()}>
        Sign out
      </button>
    </div>
  );
}
