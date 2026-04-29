// claude-design: app/shell.jsx
// Shell components: Sidebar, Topbar, AppShell

const { useState, useEffect } = React;

function Icon({ name }) {
  const paths = {
    discover: <><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" fill="none"/><path d="M8 1v14M1 8h14" stroke="currentColor" strokeWidth="1.3"/></>,
    events: <><rect x="2" y="3" width="12" height="12" stroke="currentColor" strokeWidth="1.3" fill="none"/><path d="M2 6h12M5 1v3M11 1v3" stroke="currentColor" strokeWidth="1.3"/></>,
    teams: <><circle cx="5.5" cy="6" r="2.2" stroke="currentColor" strokeWidth="1.2" fill="none"/><circle cx="10.5" cy="6" r="2.2" stroke="currentColor" strokeWidth="1.2" fill="none"/><path d="M2 13c0-1.8 1.5-3 3.5-3s3.5 1.2 3.5 3M7 13c0-1.8 1.5-3 3.5-3s3.5 1.2 3.5 3" stroke="currentColor" strokeWidth="1.2" fill="none"/></>,
    live: <><circle cx="8" cy="8" r="2" fill="currentColor"/><circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.2" fill="none"/></>,
    standings: <><path d="M2 14h12M4 14V8M8 14V4M12 14V10" stroke="currentColor" strokeWidth="1.4" fill="none"/></>,
    profile: <><circle cx="8" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.3" fill="none"/><path d="M3 14c0-2.2 2.2-4 5-4s5 1.8 5 4" stroke="currentColor" strokeWidth="1.3" fill="none"/></>,
    bell: <><path d="M4 11V7a4 4 0 1 1 8 0v4l1 1.5H3z" stroke="currentColor" strokeWidth="1.3" fill="none"/><path d="M6.5 13.5a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.3"/></>,
    download: <><path d="M8 1v9M4 7l4 4 4-4M2 14h12" stroke="currentColor" strokeWidth="1.4" fill="none"/></>,
    arrow: <><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.3" fill="none"/></>,
    plus: <><path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.4"/></>,
    search: <><circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" fill="none"/><path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.4"/></>,
    eye: <><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.2" fill="none"/><circle cx="8" cy="8" r="1.8" fill="currentColor"/></>,
    eyeoff: <><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.2" fill="none"/><path d="M2 2l12 12" stroke="currentColor" strokeWidth="1.4"/></>,
    follow: <><path d="M8 14L2 8a3.5 3.5 0 1 1 6-2.4A3.5 3.5 0 1 1 14 8z" stroke="currentColor" strokeWidth="1.3" fill="none"/></>,
    share: <><circle cx="3.5" cy="8" r="1.6" stroke="currentColor" strokeWidth="1.2" fill="none"/><circle cx="12" cy="3.5" r="1.6" stroke="currentColor" strokeWidth="1.2" fill="none"/><circle cx="12" cy="12.5" r="1.6" stroke="currentColor" strokeWidth="1.2" fill="none"/><path d="M5 7l5.5-2.7M5 9l5.5 2.7" stroke="currentColor" strokeWidth="1.2"/></>,
  };
  return <svg viewBox="0 0 16 16" width="16" height="16" style={{ display: 'inline-block', flexShrink: 0, verticalAlign: 'middle' }}>{paths[name] || null}</svg>;
}

function Crest({ kind = 'a', size = 32 }) {
  const bg = kind === 'a' ? 'var(--accent)' : 'var(--court)';
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: bg, position: 'relative', flexShrink: 0
    }}>
      <div style={{ position:'absolute', inset:0, borderRadius:'50%', borderTop: '1.5px solid var(--paper)', borderBottom: '1.5px solid var(--paper)', transform: 'scaleX(0.55)' }}/>
      <div style={{ position:'absolute', inset:0, borderRadius:'50%', borderLeft: '1.5px solid var(--paper)', borderRight: '1.5px solid var(--paper)', transform: 'scaleY(0.6)' }}/>
    </div>
  );
}

function Sidebar({ page, setPage }) {
  const items = [
    { id: 'discover', label: 'Discover', count: '124' },
    { id: 'events', label: 'My events', count: '6' },
    { id: 'team', label: 'My team', count: 'SGS' },
    { id: 'live', label: 'Live now', count: '3' },
    { id: 'standings', label: 'Standings', count: null },
    { id: 'profile', label: 'Profile', count: null },
  ];
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark"></div>
        <div className="brand-name">Remy Sport<span className="sub">เรมีสปอร์ต</span></div>
      </div>
      <div className="nav-group">
        <div className="label">Browse</div>
        {items.slice(0, 4).map(it => (
          <button key={it.id} className={`nav-item ${page === it.id ? 'active' : ''}`} onClick={() => setPage(it.id)}>
            <span className="ico"><Icon name={it.id === 'team' ? 'teams' : it.id} /></span>
            <span>{it.label}</span>
            {it.count && <span className="count">{it.count}</span>}
          </button>
        ))}
      </div>
      <div className="nav-group">
        <div className="label">You</div>
        {items.slice(4).map(it => (
          <button key={it.id} className={`nav-item ${page === it.id ? 'active' : ''}`} onClick={() => setPage(it.id)}>
            <span className="ico"><Icon name={it.id} /></span>
            <span>{it.label}</span>
            {it.count && <span className="count">{it.count}</span>}
          </button>
        ))}
      </div>
      <div className="nav-group">
        <div className="label">Following</div>
        <button className="nav-item">
          <span className="ico" style={{ background: 'var(--accent)', borderRadius: '50%' }}></span>
          <span>Saint Gabriel's</span>
        </button>
        <button className="nav-item">
          <span className="ico" style={{ background: 'var(--court)', borderRadius: '50%' }}></span>
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

function Topbar({ lang, setLang, spoiler, setSpoiler }) {
  return (
    <header className="topbar">
      <div className="search">
        <span style={{ color: 'var(--ink-3)' }}><Icon name="search"/></span>
        <input placeholder="Search events, teams, players…"/>
        <span className="kbd">⌘K</span>
      </div>
      <div className="lang-switch">
        <button className={lang === 'EN' ? 'active' : ''} onClick={() => setLang('EN')}>EN</button>
        <button className={lang === 'TH' ? 'active' : ''} onClick={() => setLang('TH')}>TH</button>
      </div>
      <button className="icon-btn" title="Spoiler mode" onClick={() => setSpoiler(s => !s)}>
        <Icon name={spoiler ? 'eyeoff' : 'eye'} />
      </button>
      <button className="icon-btn"><Icon name="bell" /><span className="badge"></span></button>
      <button className="install-btn"><Icon name="download"/>Install app</button>
    </header>
  );
}

window.RemyShell = { Sidebar, Topbar, Icon, Crest };
