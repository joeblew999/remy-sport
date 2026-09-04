import { useSession } from "../lib/session";
import { WhoAreYou } from "../components/who-are-you";
import { YourPlayers } from "../components/your-players";
import type { Route } from "../lib/router";
import { m } from "../lib/i18n";

/**
 * Your account: who you are here, and the people you are responsible for.
 *
 * Not a dashboard. This page used to be the union of every role's sections —
 * live games, invitations, events, following — and each reader saw the other
 * roles' empty states. What is yours to *do* lives on Home now, built from
 * what you hold. What stays here is what is about the account itself: what
 * you are (a spectator may say they are more), and the children you are
 * guardian to, which is an account-level fact whatever else you hold — a coach
 * who is also a parent adds their child here.
 */
export function ProfilePage({ goto }: { goto: (r: Route) => void }) {
  const { user, loading } = useSession();

  return (
    <>
      <div className="page-header">
        <div className="crumbs">{m.profile_crumb()}</div>
        <h1>
          {user ? m.welcome_back({ name: user.name || user.email }) : m.profile_signed_out()}
        </h1>
        <div className="sub">
          {user ? m.profile_sub() : loading ? "" : m.profile_signed_out_sub()}
        </div>
      </div>

      {!user && !loading && (
        <div className="page-inner">
          <div className="dash-card" data-testid="profile-signin">
            <div className="push-note">{m.profile_signed_out_why()}</div>
            <button
              className="btn primary"
              data-testid="profile-signin-button"
              onClick={() => goto({ page: "login" })}
            >
              {m.sign_in()}
            </button>
          </div>
        </div>
      )}

      {user && (
        <div className="page-inner" data-testid="profile">
          <WhoAreYou />
          <YourPlayers goto={goto} />
        </div>
      )}
    </>
  );
}
