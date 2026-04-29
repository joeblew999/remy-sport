// claude-design: app/pages/discover.jsx
const { useState: uS_disc } = React;
const { Icon: Ico_disc } = window.RemyShell;

function DiscoverPage({ goto, lang, spoiler }) {
  const [tab, setTab] = uS_disc('all');
  const [filterCity, setFilterCity] = uS_disc(null);
  const [filterType, setFilterType] = uS_disc(null);
  const allEvents = window.RemyData.useEvents();

  let events = allEvents;
  if (tab === 'live') events = events.filter(e => e.status === 'live');
  if (tab === 'open') events = events.filter(e => e.status === 'open');
  if (tab === 'upcoming') events = events.filter(e => e.status === 'upcoming');
  if (tab === 'closed') events = events.filter(e => e.status === 'closed');
  if (filterCity) events = events.filter(e => e.city === filterCity);
  if (filterType) events = events.filter(e => e.type === filterType);

  const counts = {
    all: allEvents.length,
    live: allEvents.filter(e => e.status === 'live').length,
    open: allEvents.filter(e => e.status === 'open').length,
    upcoming: allEvents.filter(e => e.status === 'upcoming').length,
    closed: allEvents.filter(e => e.status === 'closed').length,
  };

  return (
    <>
      <div className="page-header">
        <div className="crumbs"><span>HOME</span><span className="sep">/</span><span>DISCOVER</span></div>
        <h1>{lang === 'TH' ? 'ค้นหาการแข่งขัน' : 'What\'s on the court'}</h1>
        <div className={`sub ${lang === 'TH' ? 'thai' : ''}`}>
          {lang === 'TH'
            ? 'ทัวร์นาเมนต์ ลีก แคมป์ และโชว์เคสในประเทศไทย'
            : 'Tournaments, leagues, camps & showcases across Thailand schools.'}
        </div>
      </div>

      <LiveBanner goto={goto} spoiler={spoiler}/>

      <div className="discover-toolbar">
        <div className="tab-row">
          {[
            ['all','All'],['live','Live'],['open','Registering'],['upcoming','Upcoming'],['closed','Past']
          ].map(([id, label]) => (
            <button key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
              {label}<span className="count">{counts[id]}</span>
            </button>
          ))}
        </div>
        <div className="filter-row">
          {['Tournament','League','Camp','Showcase'].map(t => {
            const k = t.toLowerCase();
            return (
              <button key={t} className={`chip ${filterType === k ? 'active' : ''}`}
                onClick={() => setFilterType(filterType === k ? null : k)}>{t}</button>
            );
          })}
          <span style={{ width: 8 }} />
          {['Bangkok','Chiang Mai','Phuket','Hua Hin','Nonthaburi'].map(c => (
            <button key={c} className={`chip ${filterCity === c ? 'active' : ''}`}
              onClick={() => setFilterCity(filterCity === c ? null : c)}>{c}</button>
          ))}
        </div>
      </div>

      <div className="event-list">
        <div className="event-list-header">
          <span>Date</span><span>Event</span><span>Type</span><span>Venue</span><span>Division</span><span>Status</span><span></span>
        </div>
        {events.map(e => (
          <button key={e.id} className="event-row" onClick={() => goto({page: 'event', id: e.id})}>
            <div className="date">
              <span className="day">{String(e.day).padStart(2,'0')}</span>
              <span className="mo">{e.mo}</span>
            </div>
            <div className="title">
              <div className="name">{lang === 'TH' ? e.titleTh : e.title}</div>
              <div className="meta">{e.organizer.toUpperCase()}</div>
            </div>
            <div><span className={`type ${e.type}`}>{e.type}</span></div>
            <div className="loc">
              <div>{e.loc}</div>
              <span className="city">{e.city}</span>
            </div>
            <div className="div">{e.div}</div>
            <div><span className={`status ${e.status}`}>{e.statusLabel}</span></div>
            <div className="arrow"><Ico_disc name="arrow"/></div>
          </button>
        ))}
        {events.length === 0 && <div className="empty">No events match your filters.</div>}
      </div>
    </>
  );
}

function LiveBanner({ goto, spoiler }) {
  const G = window.RemyData.useLiveGame();
  const sa = G.quarters.a.reduce((a,b) => a + (b||0), 0);
  const sb = G.quarters.b.reduce((a,b) => a + (b||0), 0);
  const aLeading = sa > sb;
  return (
    <div className="live-banner">
      <div className="pill"><span className="dot"/>LIVE NOW</div>
      <div>
        <div className="label">{G.event}</div>
        <div className="matchup">
          <span>{G.teamA.name}</span>
          <span className="vs">vs</span>
          <span>{G.teamB.name}</span>
        </div>
      </div>
      <div className="score-mini" style={{ display: spoiler ? 'none' : 'flex' }}>
        <span className={aLeading ? 'leading' : ''}>{sa}</span>
        <span style={{ color: 'oklch(0.5 0.01 270)', fontWeight: 400 }}>·</span>
        <span className={!aLeading ? 'leading' : ''}>{sb}</span>
      </div>
      <div className="quarter">
        <div><b>{G.quarter}</b></div>
        <div style={{ marginTop: 4 }}>{G.clock}</div>
      </div>
      <button className="open-btn" onClick={() => goto({page: 'live'})}>Open game →</button>
    </div>
  );
}

window.RemyPages = Object.assign(window.RemyPages || {}, { DiscoverPage });
