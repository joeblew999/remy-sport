import { Icon } from "./icon";

interface NavItem {
  id: string;
  label: string;
  count: string | null;
}

const NAV_ITEMS: NavItem[] = [
  { id: "discover",  label: "Discover",   count: "124" },
  { id: "events",    label: "My events",  count: "6" },
  { id: "team",      label: "My team",    count: "SGS" },
  { id: "live",      label: "Live now",   count: "3" },
  { id: "standings", label: "Standings",  count: null },
  { id: "profile",   label: "Profile",    count: null },
];

export function Sidebar({ page, setPage }: { page: string; setPage: (p: string) => void }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark"></div>
        <div className="brand-name">Remy Sport<span className="sub">เรมีสปอร์ต</span></div>
      </div>
      <div className="nav-group">
        <div className="label">Browse</div>
        {NAV_ITEMS.slice(0, 4).map(it => (
          <button key={it.id} className={`nav-item ${page === it.id ? "active" : ""}`} onClick={() => setPage(it.id)}>
            <span className="ico"><Icon name={it.id === "team" ? "teams" : it.id} /></span>
            <span>{it.label}</span>
            {it.count && <span className="count">{it.count}</span>}
          </button>
        ))}
      </div>
      <div className="nav-group">
        <div className="label">You</div>
        {NAV_ITEMS.slice(4).map(it => (
          <button key={it.id} className={`nav-item ${page === it.id ? "active" : ""}`} onClick={() => setPage(it.id)}>
            <span className="ico"><Icon name={it.id} /></span>
            <span>{it.label}</span>
            {it.count && <span className="count">{it.count}</span>}
          </button>
        ))}
      </div>
      <div className="nav-group">
        <div className="label">Following</div>
        <button className="nav-item">
          <span className="ico" style={{ background: "var(--accent)", borderRadius: "50%" }}></span>
          <span>Saint Gabriel's</span>
        </button>
        <button className="nav-item">
          <span className="ico" style={{ background: "var(--court)", borderRadius: "50%" }}></span>
          <span>Bangkok Cup '26</span>
        </button>
      </div>
      <div className="sidebar-bottom">
        <div className="user-card">
          <div className="avatar">SK</div>
          <div className="info">
            <div className="name">Coach Sukasem</div>
            <div className="role">Head Coach · SGS</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
