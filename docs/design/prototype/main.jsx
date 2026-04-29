// claude-design: app/main.jsx
// Main app entry
const { useState: u_S, useEffect: u_E } = React;

const TWEAK_DEFAULTS = window.TWEAK_DEFAULTS || {
  accentColor: "#D17246",
  showTauriChrome: true,
  spoilerMode: false,
  language: "EN",
};

function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const { route, goto } = window.RemyRouter.useRouter();
  const [lang, setLang] = u_S(tweaks.language);
  const [spoiler, setSpoiler] = u_S(tweaks.spoilerMode);

  u_E(() => { setLang(tweaks.language); }, [tweaks.language]);
  u_E(() => { setSpoiler(tweaks.spoilerMode); }, [tweaks.spoilerMode]);

  u_E(() => {
    document.documentElement.style.setProperty('--accent', tweaks.accentColor);
    document.documentElement.style.setProperty('--accent-deep', tweaks.accentColor);
  }, [tweaks.accentColor]);

  const { Sidebar, Topbar } = window.RemyShell;
  const P = window.RemyPages;

  const sidebarPage = (route.page === 'event' || route.page === 'bracket') ? 'discover' : route.page;

  const handleSpoilerSet = (fn) => {
    const next = typeof fn === 'function' ? fn(spoiler) : fn;
    setSpoiler(next); setTweak('spoilerMode', next);
  };

  return (
    <>
      {tweaks.showTauriChrome && (
        <div className="tauri-chrome">
          <div className="traffic"><span className="red"/><span className="yellow"/><span className="green"/></div>
          <div className="title">Remy Sport · v0.4.2 · {route.page === 'live' ? 'LIVE — QF2' : route.page}</div>
        </div>
      )}
      <div className="app" style={tweaks.showTauriChrome ? { height: 'calc(100vh - 28px)' } : {}}>
        <Sidebar page={sidebarPage} setPage={(p) => goto({ page: p })}/>
        <div className="main">
          <Topbar lang={lang} setLang={(l) => { setLang(l); setTweak('language', l); }} spoiler={spoiler} setSpoiler={handleSpoilerSet}/>
          <div className="page">
            {route.page === 'discover' && <P.DiscoverPage goto={goto} lang={lang} spoiler={spoiler}/>}
            {route.page === 'events' && <P.DiscoverPage goto={goto} lang={lang} spoiler={spoiler}/>}
            {route.page === 'event' && <P.EventPage id={route.id} goto={goto} lang={lang}/>}
            {route.page === 'live' && <P.LivePage goto={goto} lang={lang} spoiler={spoiler} setSpoiler={handleSpoilerSet}/>}
            {route.page === 'team' && <P.TeamPage goto={goto} lang={lang}/>}
            {route.page === 'profile' && <P.ProfilePage goto={goto}/>}
            {route.page === 'standings' && (
              <>
                <div className="page-header">
                  <div className="crumbs">STANDINGS</div>
                  <h1>Bangkok Schools League · Spring '26</h1>
                  <div className="sub">U18 Boys · Round 6 of 14 · Updated 12:45 today</div>
                </div>
                <P.StandingsTable/>
              </>
            )}
          </div>
        </div>
      </div>

      <TweaksPanel title="Tweaks">
        <TweakSection title="Brand">
          <TweakColor label="Accent color" value={tweaks.accentColor} onChange={(v) => setTweak('accentColor', v)}/>
        </TweakSection>
        <TweakSection title="Window">
          <TweakToggle label="Tauri window chrome" value={tweaks.showTauriChrome} onChange={(v) => setTweak('showTauriChrome', v)}/>
        </TweakSection>
        <TweakSection title="Localization">
          <TweakRadio label="Language" value={lang} options={[
            { value: 'EN', label: 'English' },
            { value: 'TH', label: 'ไทย Thai' },
          ]} onChange={(v) => { setLang(v); setTweak('language', v); }}/>
        </TweakSection>
        <TweakSection title="Live experience">
          <TweakToggle label="Spoiler mode (hide scores)" value={spoiler} onChange={(v) => { setSpoiler(v); setTweak('spoilerMode', v); }}/>
        </TweakSection>
        <TweakSection title="Jump to screen">
          <TweakButton label="Discover" onClick={() => goto({page: 'discover'})}/>
          <TweakButton label="Event detail · Bangkok Cup" onClick={() => goto({page: 'event', id: 'e1'})}/>
          <TweakButton label="Live game" onClick={() => goto({page: 'live'})}/>
          <TweakButton label="Team · Saint Gabriel's" onClick={() => goto({page: 'team'})}/>
          <TweakButton label="Profile / Coach dashboard" onClick={() => goto({page: 'profile'})}/>
          <TweakButton label="Standings" onClick={() => goto({page: 'standings'})}/>
        </TweakSection>
      </TweaksPanel>
    </>
  );
}

function tryRender() {
  if (typeof TweaksPanel === 'undefined' || !window.RemyShell || !window.RemyPages || !window.RemyRouter) {
    return setTimeout(tryRender, 30);
  }
  ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
}
tryRender();
