import { Icon } from "./icon";
import { initialsFor } from "./account";
import { useSession } from "../lib/session";
import { m } from "../lib/i18n";

/**
 * Who is actually signed in.
 *
 * This was "SK / Coach Sukasem / Head Coach · SGS", hardcoded, and it sat at the
 * bottom of every page while the topbar showed the real account a few hundred
 * pixels away — so a signed-in coach saw two different people at once. It read
 * as fact because nothing marked it as invented, which is what AGENTS.md's
 * "never invent a value for a field with no table" is about.
 *
 * The platform role, like the topbar: the school beside it would need the org
 * behind `session.activeOrganizationId`, and inventing one is how this started.
 */
function UserCard() {
  const { user, loading } = useSession();
  if (loading || !user) return null;

  const label = user.name || user.email;
  return (
    <div className="user-card" data-testid="sidebar-user">
      <div className="avatar" aria-hidden="true">{initialsFor(label)}</div>
      <div className="info">
        <div className="name">{label}</div>
        {user.role && <div className="role">{user.role}</div>}
      </div>
    </div>
  );
}

interface NavItem {
  id: string;
  label: string;
}

/**
 * Built per render, not once at module scope.
 *
 * A message is a *call* — `m.nav_orgs()` evaluates to the string for whichever
 * locale is active when it runs. At module scope it ran once at import and the
 * label then stayed in that language forever, which switching to Thai showed
 * immediately. Nothing caught it earlier because every other label here is a
 * hardcoded English literal, and those are the same in both languages by
 * accident rather than by design.
 *
 * The badges these carried are gone: "124" beside Discover, "6", "3", "SGS".
 * None came from anywhere — the API returns four events — and a number in a nav
 * reads as a count, not as decoration. `useEvents()` is already cached by the
 * time this renders, so a real one is cheap if it is ever wanted; an invented
 * one is not worth having.
 *
 * Every label is a message now. They were English literals, which is why the
 * whole sidebar stayed in English on a Thai page while the group headings above
 * them translated.
 *
 * No "Standings" entry: a league table belongs to an event, so there is nothing
 * for a top-level one to show. It is a tab on the event page.
 */
const navItems = (): NavItem[] => [
  { id: "discover",  label: m.nav_discover() },
  { id: "events",    label: m.nav_my_events() },
  { id: "team",      label: m.nav_my_team() },
  // No Watch or Broadcast entries. Video belongs to a game, not to the app:
  // "Watch" with no game is a question the nav cannot answer, and it used to
  // guess — sending two devices to whatever each thought was current. Live now
  // lists what is actually being played and offers Watch on the games somebody
  // is broadcasting.
  { id: "live",      label: m.nav_live() },
  { id: "orgs",      label: m.nav_orgs() },
  { id: "profile",   label: m.nav_profile() },
];

export function Sidebar({ page, setPage }: { page: string; setPage: (p: string) => void }) {
  const NAV_ITEMS = navItems();
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark"></div>
        <div className="brand-name">Remy Sport<span className="sub">เรมีสปอร์ต</span></div>
      </div>
      <div className="nav-group">
        <div className="label">{m.browse()}</div>
        {NAV_ITEMS.slice(0, 4).map(it => (
          <button key={it.id} className={`nav-item ${page === it.id ? "active" : ""}`} onClick={() => setPage(it.id)}>
            <span className="ico"><Icon name={it.id === "team" ? "teams" : it.id} /></span>
            <span>{it.label}</span>
          </button>
        ))}
      </div>
      <div className="nav-group">
        <div className="label">{m.nav_you()}</div>
        {NAV_ITEMS.slice(4).map(it => (
          <button key={it.id} className={`nav-item ${page === it.id ? "active" : ""}`} onClick={() => setPage(it.id)}>
            <span className="ico"><Icon name={it.id} /></span>
            <span>{it.label}</span>
          </button>
        ))}
      </div>
      {/* No "Following" group. It listed Saint Gabriel's and Bangkok Cup '26 for
          every viewer, signed in or not, and neither button did anything.
          The model has a `subscriptions` table and the FOLLOWER_TEAM and
          FOLLOWER_EVENT relations derive from it — so this can be real. It needs
          an endpoint, not two hardcoded rows. */}
      <div className="sidebar-bottom">
        <UserCard />
      </div>
    </aside>
  );
}
