// Page components for Remy Sport prototype
const { useState: uS, useEffect: uE } = React;
const { Icon: Ico, Crest: Cr } = window.RemyShell;

// ---------- DISCOVER ----------
function DiscoverPage({ goto, lang, spoiler }) {
  const [tab, setTab] = uS('all');
  const [filterCity, setFilterCity] = uS(null);
  const [filterType, setFilterType] = uS(null);
  const E = window.REMY.EVENTS;

  let events = E;
  if (tab === 'live') events = events.filter(e => e.status === 'live');
  if (tab === 'open') events = events.filter(e => e.status === 'open');
  if (tab === 'upcoming') events = events.filter(e => e.status === 'upcoming');
  if (tab === 'closed') events = events.filter(e => e.status === 'closed');
  if (filterCity) events = events.filter(e => e.city === filterCity);
  if (filterType) events = events.filter(e => e.type === filterType);

  const counts = {
    all: E.length,
    live: E.filter(e => e.status === 'live').length,
    open: E.filter(e => e.status === 'open').length,
    upcoming: E.filter(e => e.status === 'upcoming').length,
    closed: E.filter(e => e.status === 'closed').length,
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
            <div className="arrow"><Ico name="arrow"/></div>
          </button>
        ))}
        {events.length === 0 && <div className="empty">No events match your filters.</div>}
      </div>
    </>
  );
}

function LiveBanner({ goto, spoiler }) {
  const G = window.REMY.LIVE_GAME;
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

// ---------- EVENT DETAIL ----------
function EventPage({ id, goto, lang }) {
  const e = window.REMY.EVENTS.find(x => x.id === id) || window.REMY.EVENTS[0];
  const [tab, setTab] = uS('overview');

  return (
    <>
      <div className="event-hero">
        <div className="meta-bar">
          <button onClick={() => goto({page:'discover'})} className="crumbs" style={{ background: 'transparent', border: 'none', padding: 0, fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: 'var(--ink-3)', letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>← DISCOVER</button>
          <span className={`type ${e.type}`} style={{
            display: 'inline-flex', padding: '3px 8px',
            fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, letterSpacing: '0.1em',
            border: '1px solid var(--ink)', textTransform: 'uppercase',
            background: e.type === 'tournament' ? 'var(--ink)' : 'transparent',
            color: e.type === 'tournament' ? 'var(--paper)' : 'var(--ink)',
            borderColor: e.type === 'showcase' ? 'var(--accent)' : 'var(--ink)',
          }}>{e.type}</span>
          <span className={`status ${e.status}`} style={{
            fontFamily:'IBM Plex Mono, monospace', fontSize: 11,
            letterSpacing: '0.06em', textTransform: 'uppercase',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            color: e.status === 'live' ? 'var(--live)' : (e.status === 'open' ? 'var(--good)' : 'var(--ink-3)'),
            fontWeight: 500
          }}>
            {e.status === 'live' && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--live)', display: 'inline-block' }}/>}
            {e.statusLabel}
          </span>
        </div>
        <h1>
          {lang === 'TH' ? e.titleTh : (
            <>{e.title.split(' — ')[0]} <em>— {e.title.split(' — ')[1] || e.div}</em></>
          )}
        </h1>
        <div className="tagline">{e.date} · {e.loc} · {e.city} · {e.div}</div>
        <div className="tagline thai" style={{ fontSize: 14 }}>จัดโดย {e.organizer}</div>

        <div className="event-stats">
          <div className="stat-cell">
            <div className="label">Teams</div>
            <div className="value">{e.teams || '—'}</div>
          </div>
          <div className="stat-cell">
            <div className="label">Courts</div>
            <div className="value">{e.courts || '—'}</div>
          </div>
          <div className="stat-cell">
            <div className="label">Games</div>
            <div className="value">
              {e.gamesPlayed > 0 ? <><em>{e.gamesPlayed}</em> / {e.games}</> : (e.games || '—')}
            </div>
            {e.gamesPlayed > 0 && <div className="sub">{e.games - e.gamesPlayed} remaining</div>}
          </div>
          <div className="stat-cell">
            <div className="label">Format</div>
            <div className="value" style={{ fontSize: 18 }}>Single-elim</div>
            <div className="sub">+ 3rd-place game</div>
          </div>
          <div className="stat-cell">
            <div className="label">Following</div>
            <div className="value" style={{ fontSize: 18 }}>284</div>
            <div className="sub">parents, coaches, scouts</div>
          </div>
        </div>

        <div className="event-actions">
          {e.status === 'open' && <button className="btn accent">Register team</button>}
          <button className="btn primary"><Ico name="follow"/>Follow event</button>
          <button className="btn">Add to calendar</button>
          <button className="btn"><Ico name="share"/>Share</button>
        </div>
      </div>

      <div className="detail-tabs">
        {[
          ['overview','Overview'],
          ['bracket','Bracket'],
          ['schedule','Schedule'],
          ['standings','Standings'],
          ['teams','Teams (16)'],
          ['venues','Venues'],
          ['rules','Rules & info'],
        ].map(([id, label]) => (
          <button key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === 'overview' && <EventOverview e={e} goto={goto}/>}
      {tab === 'bracket' && <BracketView goto={goto}/>}
      {tab === 'schedule' && <SchedulePlaceholder/>}
      {tab === 'standings' && <StandingsTable/>}
      {tab !== 'overview' && tab !== 'bracket' && tab !== 'schedule' && tab !== 'standings' && (
        <div className="page-inner"><div className="empty">{tab.toUpperCase()} view — not part of this hi-fi pass.</div></div>
      )}
    </>
  );
}

function EventOverview({ e, goto }) {
  const G = window.REMY.LIVE_GAME;
  return (
    <div className="page-inner">
      <div className="dash-grid">
        <div>
          <div className="section-h"><h2>Live & next up</h2><a className="more">VIEW SCHEDULE →</a></div>
          <div className="dash-card" style={{ borderColor: 'var(--live)', borderWidth: 1.5 }}>
            <div className="head" style={{ color: 'var(--live)' }}>
              <span><span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--live)', marginRight: 6, animation: 'pulse 1.4s infinite' }}/>LIVE · {G.quarter} {G.clock} · COURT B</span>
              <a className="more" onClick={() => goto({page: 'live'})} style={{ cursor: 'pointer', color: 'var(--ink)' }}>OPEN →</a>
            </div>
            <div className="next-game">
              <div className="team">
                <div className="name">{G.teamA.name}</div>
                <div className="meta">SEED {G.teamA.seed} · {G.teamA.record}</div>
              </div>
              <div className="when">
                <div className="countdown" style={{ color: 'var(--live)', fontVariantNumeric: 'tabular-nums' }}>
                  {G.quarters.a.reduce((a,b)=>a+(b||0),0)}–{G.quarters.b.reduce((a,b)=>a+(b||0),0)}
                </div>
                <div className="label">QUARTERFINAL 2</div>
              </div>
              <div className="team r">
                <div className="name">{G.teamB.name}</div>
                <div className="meta">SEED {G.teamB.seed} · {G.teamB.record}</div>
              </div>
            </div>
          </div>

          <div className="dash-card" style={{ marginTop: 12 }}>
            <div className="head"><span>NEXT · 14:00 · COURT A</span></div>
            <div className="next-game">
              <div className="team">
                <div className="name">Triam Udom</div>
                <div className="meta">SEED 3 · 1–0</div>
              </div>
              <div className="when">
                <div className="countdown">1:18</div>
                <div className="label">UNTIL TIPOFF</div>
              </div>
              <div className="team r">
                <div className="name">Bangkok Patana</div>
                <div className="meta">SEED 6 · 1–0</div>
              </div>
            </div>
          </div>

          <div className="section-h"><h2>Top performers · today</h2><a className="more">ALL STATS →</a></div>
          <div className="dash-card">
            {[
              { name: 'Phongphan S.', team: "Saint Gabriel's", line: '24 PTS · 8 AST · 3 STL', stat: 'pts'},
              { name: 'Krit T.', team: 'Assumption', line: '21 PTS · 6 REB · 4 3PM', stat: 'pts'},
              { name: 'Boonyarit T.', team: "Saint Gabriel's", line: '18 PTS · 11 REB · 2 BLK', stat: 'dd'},
              { name: 'Tanawat W.', team: 'Bangkok Christian', line: '16 PTS · 9 AST · 2 STL', stat: ''},
            ].map((p, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '32px 1fr auto', gap: 12, padding: '12px 18px', borderBottom: '1px solid var(--rule)', alignItems: 'center' }}>
                <div className="avatar" style={{ width: 32, height: 32, fontSize: 11 }}>{p.name.split(' ').map(x=>x[0]).join('')}</div>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{p.name}</div>
                  <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: 'var(--ink-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{p.team}</div>
                </div>
                <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: 'var(--ink-2)', letterSpacing: '0.04em' }}>{p.line}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="section-h"><h2>Standings</h2><a className="more">FULL TABLE →</a></div>
          <div className="dash-card">
            <div className="standing-row head">
              <span></span><span>Team</span><span>W</span><span>L</span><span></span><span>PTS</span>
            </div>
            {window.REMY.STANDINGS.slice(0, 6).map(s => (
              <div key={s.rank} className={`standing-row ${s.you ? 'you' : ''}`}>
                <span className="rank">#{s.rank}</span>
                <span className="team">{s.team}</span>
                <span className="num">{s.w}</span>
                <span className="num">{s.l}</span>
                <span className="num">{s.pf-s.pa > 0 ? '+' : ''}{s.pf-s.pa}</span>
                <span className="pts">{s.pts}</span>
              </div>
            ))}
          </div>

          <div className="section-h"><h2>Recent results</h2></div>
          <div className="dash-card">
            {[
              ['BKC','SJS','68','51', true],
              ['SGS','SKL','71','54', true],
              ['ASC','RIS','65','58', true],
              ['TUS','WCR','67','50', true],
            ].map((r, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 50px 50px', padding: '12px 18px', borderBottom: '1px solid var(--rule)', alignItems: 'center' }}>
                <div style={{ fontSize: 13 }}>
                  <div style={{ fontWeight: 600 }}>{r[0]}</div>
                  <div style={{ color: 'var(--ink-3)', marginTop: 2 }}>{r[1]}</div>
                </div>
                <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 18, textAlign: 'right', color: 'var(--accent)' }}>{r[2]}</div>
                <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500, fontSize: 18, textAlign: 'right', color: 'var(--ink-3)' }}>{r[3]}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StandingsTable() {
  const S = window.REMY.STANDINGS;
  return (
    <div className="page-inner">
      <div className="dash-card">
        <div className="standing-row head" style={{ gridTemplateColumns: '40px 1fr 50px 50px 70px 70px 70px 60px' }}>
          <span></span><span>Team</span><span>W</span><span>L</span><span>PF</span><span>PA</span><span>±</span><span>PTS</span>
        </div>
        {S.map(s => (
          <div key={s.rank} className={`standing-row ${s.you ? 'you' : ''}`} style={{ gridTemplateColumns: '40px 1fr 50px 50px 70px 70px 70px 60px' }}>
            <span className="rank">#{s.rank}</span>
            <span className="team">{s.team}</span>
            <span className="num">{s.w}</span>
            <span className="num">{s.l}</span>
            <span className="num">{s.pf}</span>
            <span className="num">{s.pa}</span>
            <span className="num" style={{ color: s.pf-s.pa > 0 ? 'var(--good)' : 'var(--ink-3)' }}>{s.pf-s.pa > 0 ? '+' : ''}{s.pf-s.pa}</span>
            <span className="pts">{s.pts}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SchedulePlaceholder() {
  const games = [
    { time: '09:00', court: 'A', a: 'BKC', b: 'SAR', sa: 78, sb: 42, status: 'F' },
    { time: '09:00', court: 'B', a: 'MDS', b: 'SJS', sa: 55, sb: 62, status: 'F' },
    { time: '10:30', court: 'A', a: 'SGS', b: 'SKL', sa: 71, sb: 54, status: 'F' },
    { time: '10:30', court: 'B', a: 'ASC', b: 'RIS', sa: 65, sb: 58, status: 'F' },
    { time: '12:00', court: 'A', a: 'BKC', b: 'SJS', sa: 68, sb: 51, status: 'F' },
    { time: '12:00', court: 'B', a: 'SGS', b: 'ASC', sa: 54, sb: 49, status: 'LIVE', live: true },
    { time: '14:00', court: 'A', a: 'TUS', b: 'BKP', sa: null, sb: null, status: 'Up' },
    { time: '15:30', court: 'A', a: 'ISB', b: 'WLS', sa: null, sb: null, status: 'Up' },
  ];
  return (
    <div className="page-inner">
      <div className="dash-card">
        <div style={{ display: 'grid', gridTemplateColumns: '80px 60px 1fr 80px 1fr 80px 60px', padding: '10px 18px', borderBottom: '1px solid var(--rule)', fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          <span>Time</span><span>Court</span><span>Home</span><span>Score</span><span>Away</span><span></span><span>Status</span>
        </div>
        {games.map((g, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '80px 60px 1fr 80px 1fr 80px 60px', padding: '14px 18px', borderBottom: '1px solid var(--rule)', alignItems: 'center', background: g.live ? 'var(--accent-soft)' : 'transparent' }}>
            <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500, fontSize: 16 }}>{g.time}</span>
            <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: 'var(--ink-3)', letterSpacing: '0.06em' }}>CT {g.court}</span>
            <span style={{ fontWeight: g.sa > g.sb ? 600 : 400 }}>{g.a}</span>
            <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, color: g.sa > g.sb ? 'var(--accent)' : 'var(--ink)' }}>
              {g.sa !== null ? `${g.sa}–${g.sb}` : '—'}
            </span>
            <span style={{ fontWeight: g.sb > g.sa ? 600 : 400 }}>{g.b}</span>
            <span></span>
            <span style={{
              fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, letterSpacing: '0.1em',
              color: g.live ? 'var(--live)' : (g.status === 'F' ? 'var(--ink-3)' : 'var(--ink-2)'),
              fontWeight: g.live ? 500 : 400
            }}>{g.status === 'LIVE' ? '● LIVE' : (g.status === 'F' ? 'FINAL' : 'UPCOMING')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- BRACKET VIEW ----------
function BracketView({ goto }) {
  const B = window.REMY.BRACKET;
  return (
    <div className="bracket-page">
      <div className="legend">
        <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>FORMAT · SINGLE-ELIMINATION · 16 TEAMS</span>
        <span style={{ marginLeft: 'auto' }}/>
        <span className="swatch live"><span className="dot"/>LIVE</span>
        <span className="swatch done"><span className="dot"/>FINAL</span>
        <span className="swatch upcoming"><span className="dot"/>UPCOMING</span>
      </div>
      <div className="bracket">
        {B.rounds.map((r, ri) => (
          <div key={ri} className="bracket-round">
            <div className="round-label">{r.label}</div>
            <div className="matches">
              {r.matches.map(m => (
                <button key={m.id} className={`match ${m.status === 'live' ? 'live' : ''}`} onClick={() => m.status === 'live' && goto({page: 'live'})}>
                  <div className="match-head">
                    <span>{m.label || (m.status === 'done' ? 'FINAL' : (m.status === 'live' ? `${m.label || 'LIVE'}` : 'UPCOMING'))}</span>
                    <span style={{ fontFamily: 'IBM Plex Mono, monospace' }}>{m.id.toUpperCase()}</span>
                  </div>
                  {[m.a, m.b].map((t, ti) => (
                    <div key={ti} className={`match-team ${t.win ? 'win' : ''} ${t.tba ? 'tba' : ''} ${m.status === 'live' && t.win ? 'live' : ''}`}>
                      <span className="seed">{t.seed ? `#${t.seed}` : ''}</span>
                      <span className="name">{t.name}</span>
                      {t.score !== undefined && <span className="score">{t.score}</span>}
                    </div>
                  ))}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- LIVE GAME ----------
function LivePage({ goto, lang, spoiler, setSpoiler }) {
  const G = window.REMY.LIVE_GAME;
  const sa = G.quarters.a.reduce((a,b) => a + (b||0), 0);
  const sb = G.quarters.b.reduce((a,b) => a + (b||0), 0);
  const aLeading = sa > sb;

  return (
    <div className="live-page">
      <div className="crumbs" style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12, color: 'oklch(0.6 0.01 270)' }}>
        <button onClick={() => goto({page: 'discover'})} style={{ background: 'transparent', border: 'none', padding: 0, color: 'inherit', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit', letterSpacing: 'inherit' }}>DISCOVER</button>
        <span style={{ opacity: 0.5 }}>/</span>
        <button onClick={() => goto({page: 'event', id: 'e1'})} style={{ background: 'transparent', border: 'none', padding: 0, color: 'inherit', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit', letterSpacing: 'inherit' }}>BANGKOK CUP</button>
        <span style={{ opacity: 0.5 }}>/</span>
        <span>QUARTERFINAL 2</span>
      </div>

      <div className="spoiler-bar">
        <span><Ico name={spoiler ? 'eyeoff' : 'eye'}/> &nbsp; {spoiler ? 'SPOILER MODE ON · scores hidden' : 'SHOWING LIVE SCORES'}</span>
        <button className="toggle" onClick={() => setSpoiler(s => !s)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: 'oklch(0.7 0.01 270)' }}>
          HIDE SCORES
          <span className={`toggle-track ${spoiler ? 'on' : ''}`}/>
        </button>
      </div>

      <div className="live-header">
        <div>
          <div className="court">{G.event}</div>
          <div className="court" style={{ color: 'oklch(0.85 0.01 270)', marginTop: 4 }}>{G.court} · HUA MARK INDOOR · BANGKOK</div>
        </div>
        <div className="row-flex" style={{ gap: 12 }}>
          <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: 'oklch(0.7 0.01 270)', letterSpacing: '0.06em' }}>
            <Ico name="eye"/> &nbsp; {G.watching} watching
          </span>
          <div className="pill"><span className="dot"/>LIVE</div>
        </div>
      </div>

      <div className="live-scoreboard">
        <div className="score-team">
          <div className="crest a"></div>
          <div className="name">{G.teamA.name}</div>
          <div className="name-th">{G.teamA.nameTh}</div>
          <div className="meta">SEED {G.teamA.seed} · {G.teamA.record}</div>
        </div>
        {!spoiler ? (
          <div className="score-numbers">
            <span className={aLeading ? 'leading' : ''}>{sa}</span>
            <span className="sep">·</span>
            <span className={!aLeading ? 'leading' : ''}>{sb}</span>
          </div>
        ) : (
          <div className="score-numbers" style={{ color: 'oklch(0.4 0.01 270)' }}>
            <span>--</span>
            <span className="sep">·</span>
            <span>--</span>
          </div>
        )}
        <div className="score-team r">
          <div className="crest b"></div>
          <div className="name">{G.teamB.name}</div>
          <div className="name-th">{G.teamB.nameTh}</div>
          <div className="meta">SEED {G.teamB.seed} · {G.teamB.record}</div>
        </div>
      </div>

      <div className="live-clock">
        <div className="quarter">QUARTER {G.quarter.replace('Q','')} · {Math.floor(parseInt(G.clock.split(':')[0]))}:{G.clock.split(':')[1]} REMAINING</div>
        <div className="time" style={{ color: 'var(--accent)' }}>{G.clock}</div>
      </div>

      <div className="quarters-table">
        <div className="row" style={{ display: 'contents' }}>
          <div className="cell head label">Team</div>
          <div className="cell head">Q1</div>
          <div className="cell head">Q2</div>
          <div className="cell head">Q3</div>
          <div className="cell head">Q4</div>
          <div className="cell head"></div>
          <div className="cell head">Total</div>
        </div>
        <div className="row" style={{ display: 'contents' }}>
          <div className="cell team-name">{G.teamA.short} · {G.teamA.name}</div>
          {G.quarters.a.map((q, i) => (
            <div key={i} className="cell">{q !== null ? q : '—'}</div>
          ))}
          <div className="cell"></div>
          <div className="cell total">{spoiler ? '--' : sa}</div>
        </div>
        <div className="row" style={{ display: 'contents' }}>
          <div className="cell team-name">{G.teamB.short} · {G.teamB.name}</div>
          {G.quarters.b.map((q, i) => (
            <div key={i} className="cell">{q !== null ? q : '—'}</div>
          ))}
          <div className="cell"></div>
          <div className="cell total" style={{ color: !aLeading ? 'var(--accent)' : 'oklch(0.7 0.01 270)' }}>{spoiler ? '--' : sb}</div>
        </div>
      </div>

      <div className="live-side-grid">
        <div className="panel">
          <div className="panel-head"><span>PLAY-BY-PLAY</span><span>AUTO-SCROLL ↻</span></div>
          <div className="play-by-play">
            {G.pbp.map((p, i) => (
              <div key={i} className={`play ${p.score ? 'score-event' : ''}`}>
                <span className="ts">{p.ts}</span>
                <span className="desc" dangerouslySetInnerHTML={{ __html: p.desc }}/>
              </div>
            ))}
          </div>
        </div>

        <div className="live-actions">
          <button className="live-action-btn primary">
            <div>
              <div className="label">QUICK ACTION</div>
              <div className="val">Ask AI assistant</div>
            </div>
            <span className="icon">⌘K</span>
          </button>
          <button className="live-action-btn">
            <div>
              <div className="label">BOX SCORE</div>
              <div className="val">Player stats →</div>
            </div>
          </button>
          <button className="live-action-btn">
            <div>
              <div className="label">PARENTS &amp; FAMILY</div>
              <div className="val">412 watching</div>
            </div>
            <span style={{ color: 'var(--accent)' }}>+</span>
          </button>
          <button className="live-action-btn">
            <div>
              <div className="label">SCORER</div>
              <div className="val">Coach Sukasem</div>
            </div>
          </button>
          <button className="live-action-btn" onClick={() => goto({page: 'event', id: 'e1'})}>
            <div>
              <div className="label">EVENT</div>
              <div className="val">Bangkok Cup '26 →</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- TEAM PAGE ----------
function TeamPage({ goto, lang }) {
  return (
    <>
      <div className="team-hero">
        <div className="crest"></div>
        <div>
          <h1>Saint Gabriel's College</h1>
          <div className="meta thai" style={{ fontFamily: 'Noto Sans Thai, sans-serif', fontSize: 16, color: 'var(--ink-2)', marginTop: 4 }}>เซนต์คาเบรียล · บางกอก</div>
          <div className="meta">U16 Boys · Roster of 12 · Coach Sukasem · Founded 1920</div>
          <div className="event-actions" style={{ marginTop: 16 }}>
            <button className="btn primary"><Ico name="follow"/>Following</button>
            <button className="btn">Roster</button>
            <button className="btn">Stats</button>
            <button className="btn">Schedule</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 32, alignItems: 'baseline' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>RECORD</div>
            <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 32, letterSpacing: '-0.02em' }}>4–0</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>RANK</div>
            <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 32, letterSpacing: '-0.02em', color: 'var(--accent)' }}>#2</div>
          </div>
        </div>
      </div>

      <div className="page-inner">
        <div className="section-h"><h2>Roster</h2><a className="more">EXPORT CSV →</a></div>
        <div className="roster-grid">
          {window.REMY.ROSTER.map(p => (
            <div key={p.num} className="player-card">
              <div className="ava">{p.name.split(' ').map(x=>x[0]).join('')}</div>
              <div>
                <div className="name">{p.name}</div>
                <div className="pos">{p.pos} · {p.height}</div>
                <div className="stats">
                  <span><b>{p.pts}</b> PPG</span>
                  <span><b>{p.ast}</b> APG</span>
                  <span><b>{p.reb}</b> RPG</span>
                </div>
              </div>
              <div className="num">{p.num}</div>
            </div>
          ))}
        </div>

        <div className="section-h" style={{ marginTop: 48 }}><h2>Schedule · Spring 2026</h2><a className="more">FULL SEASON →</a></div>
        <div className="dash-card">
          {[
            { date: 'May 4', vs: 'Triam Udom', sa: 71, sb: 64, w: true, type: 'BSL' },
            { date: 'May 7', vs: 'Mater Dei', sa: 82, sb: 51, w: true, type: 'BSL' },
            { date: 'May 9', vs: 'ISB', sa: 64, sb: 70, w: false, type: 'BSL' },
            { date: 'May 12', vs: 'Suankularb', sa: 71, sb: 54, w: true, type: 'CUP · R16' },
            { date: 'May 13', vs: 'Assumption', sa: '54', sb: '49', w: null, live: true, type: 'CUP · QF' },
            { date: 'May 14', vs: 'TBA', sa: null, sb: null, type: 'CUP · SF' },
            { date: 'May 18', vs: 'Bangkok Christian', sa: null, sb: null, type: 'BSL' },
          ].map((g, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 80px 100px 80px', padding: '14px 18px', borderBottom: '1px solid var(--rule)', alignItems: 'center', background: g.live ? 'var(--accent-soft)' : 'transparent' }}>
              <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500, fontSize: 14 }}>{g.date}</span>
              <span style={{ fontSize: 14 }}>vs <b>{g.vs}</b></span>
              <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{g.type}</span>
              <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 16, textAlign: 'right' }}>
                {g.sa !== null ? `${g.sa}–${g.sb}` : <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>—</span>}
              </span>
              <span style={{
                fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, letterSpacing: '0.1em',
                textAlign: 'right',
                color: g.live ? 'var(--live)' : (g.w === true ? 'var(--good)' : (g.w === false ? 'var(--ink-3)' : 'var(--ink-3)')),
                fontWeight: g.live || g.w === true ? 500 : 400
              }}>{g.live ? '● LIVE Q3' : (g.w === true ? 'WIN' : (g.w === false ? 'LOSS' : 'UPCOMING'))}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ---------- PROFILE / DASHBOARD ----------
function ProfilePage({ goto }) {
  return (
    <>
      <div className="page-header">
        <div className="crumbs">PROFILE / COACH</div>
        <h1>Welcome back, Sukasem.</h1>
        <div className="sub">Saint Gabriel's College · U16 Boys · Head Coach since 2019</div>
      </div>

      <div className="page-inner">
        <div className="dash-grid">
          <div>
            <div className="section-h"><h2>Your live game</h2><a className="more" onClick={() => goto({page:'live'})} style={{ cursor: 'pointer' }}>OPEN COURT VIEW →</a></div>
            <div className="dash-card" style={{ borderColor: 'var(--live)', borderWidth: 1.5 }}>
              <div className="head" style={{ color: 'var(--live)' }}>
                <span><span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--live)', marginRight: 6, animation: 'pulse 1.4s infinite' }}/>LIVE · Q3 06:42 · COURT B · BANGKOK CUP QF</span>
              </div>
              <div className="next-game">
                <div className="team">
                  <div className="name">Saint Gabriel's</div>
                  <div className="meta">YOUR TEAM</div>
                </div>
                <div className="when">
                  <div className="countdown" style={{ color: 'var(--live)' }}>54–49</div>
                  <div className="label">LEADING +5</div>
                </div>
                <div className="team r">
                  <div className="name">Assumption</div>
                  <div className="meta">SEED 4</div>
                </div>
              </div>
            </div>

            <div className="section-h"><h2>Activity</h2><a className="more">ALL →</a></div>
            <div className="dash-card feed-list">
              {window.REMY.FEED.map((f, i) => (
                <div key={i} className="feed-item">
                  <div className={`dot ${f.dot === 'live' ? '' : (f.dot === 'on' ? '' : 'muted')}`} style={f.dot === 'live' ? { background: 'var(--live)', animation: 'pulse 1.4s infinite' } : {}}></div>
                  <div>
                    <div className="desc" dangerouslySetInnerHTML={{ __html: f.desc }}></div>
                    <span className="ts">{f.ts}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="section-h"><h2>Your events</h2><a className="more">+ NEW</a></div>
            <div className="dash-card">
              {window.REMY.EVENTS.slice(0, 4).map(e => (
                <button key={e.id} onClick={() => goto({page:'event', id: e.id})} style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '14px 18px', borderBottom: '1px solid var(--rule)',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  borderLeft: 'none', borderRight: 'none', borderTop: 'none'
                }}>
                  <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 14, letterSpacing: '-0.01em' }}>{e.title}</div>
                  <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.06em', marginTop: 4, textTransform: 'uppercase' }}>
                    {e.statusLabel} · {e.div}
                  </div>
                </button>
              ))}
            </div>

            <div className="section-h"><h2>Quick actions</h2></div>
            <div className="dash-card">
              {[
                ['+', 'Create event', 'Tournament, league, camp or showcase'],
                ['↗', 'Add to roster', '12 players · 3 spots open'],
                ['⌘', 'Ask AI assistant', '"How are we doing this season?"'],
                ['↓', 'Export season report', 'PDF · spring 2026'],
              ].map((a, i) => (
                <button key={i} style={{
                  display: 'grid', gridTemplateColumns: '32px 1fr', gap: 12,
                  width: '100%', textAlign: 'left',
                  padding: '14px 18px', borderBottom: i < 3 ? '1px solid var(--rule)' : 'none',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  alignItems: 'center'
                }}>
                  <span style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: 'var(--paper-2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500
                  }}>{a[0]}</span>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>{a[1]}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>{a[2]}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

window.RemyPages = { DiscoverPage, EventPage, BracketView, LivePage, TeamPage, ProfilePage, StandingsTable };
