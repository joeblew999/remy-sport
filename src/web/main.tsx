import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { Sidebar } from "./components/sidebar";
import { Topbar } from "./components/topbar";
import { useRouter } from "./lib/router";
import type { Lang } from "./lib/i18n";

import { DiscoverPage } from "./pages/discover";
import { EventPage } from "./pages/event";
import { LivePage } from "./pages/live";
import { TeamPage } from "./pages/team";
import { ProfilePage } from "./pages/profile";
import { StandingsTable } from "./pages/event";

interface TweakDefaults {
  accentColor?: string;
  showTauriChrome?: boolean;
  spoilerMode?: boolean;
  language?: Lang;
}

declare global {
  interface Window {
    TWEAK_DEFAULTS?: TweakDefaults;
  }
}

const DEFAULTS: Required<TweakDefaults> = {
  accentColor: "#D17246",
  showTauriChrome: true,
  spoilerMode: false,
  language: "EN",
};

function App() {
  const tweaks = { ...DEFAULTS, ...(window.TWEAK_DEFAULTS ?? {}) } as Required<TweakDefaults>;
  const { route, goto } = useRouter();
  const [lang, setLang] = useState<Lang>(tweaks.language);
  const [spoiler, setSpoiler] = useState<boolean>(tweaks.spoilerMode);
  // Mobile sidebar drawer state
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    document.documentElement.style.setProperty("--accent", tweaks.accentColor);
    document.documentElement.style.setProperty("--accent-deep", tweaks.accentColor);
  }, [tweaks.accentColor]);

  const sidebarPage = (route.page === "event" || route.page === "bracket") ? "discover" : route.page;

  const handleSpoilerSet = (fn: boolean | ((prev: boolean) => boolean)) => {
    setSpoiler(prev => typeof fn === "function" ? fn(prev) : fn);
  };

  const setPageAndCloseDrawer = (p: string) => {
    goto({ page: p });
    setNavOpen(false);
  };

  return (
    <>
      {tweaks.showTauriChrome && (
        <div className="tauri-chrome">
          <div className="traffic"><span className="red"/><span className="yellow"/><span className="green"/></div>
          <div className="title">Remy Sport · {route.page === "live" ? "LIVE — QF2" : route.page}</div>
        </div>
      )}
      <div className={`app ${navOpen ? "nav-open" : ""}`} style={tweaks.showTauriChrome ? { height: "calc(100vh - 28px)" } : {}}>
        <Sidebar page={sidebarPage} setPage={setPageAndCloseDrawer}/>
        {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)}/>}
        <div className="main">
          <Topbar lang={lang} setLang={setLang} spoiler={spoiler} setSpoiler={handleSpoilerSet} onMenu={() => setNavOpen(o => !o)}/>
          <div className="page">
            {route.page === "discover" && <DiscoverPage goto={goto} lang={lang} spoiler={spoiler}/>}
            {route.page === "events" && <DiscoverPage goto={goto} lang={lang} spoiler={spoiler}/>}
            {route.page === "event" && <EventPage id={route.id} goto={goto} lang={lang}/>}
            {route.page === "live" && <LivePage goto={goto} lang={lang} spoiler={spoiler} setSpoiler={handleSpoilerSet}/>}
            {route.page === "team" && <TeamPage goto={goto} lang={lang}/>}
            {route.page === "profile" && <ProfilePage goto={goto}/>}
            {route.page === "standings" && (
              <>
                <div className="page-header">
                  <div className="crumbs">STANDINGS</div>
                  <h1>Bangkok Schools League · Spring '26</h1>
                  <div className="sub">U18 Boys · Round 6 of 14 · Updated 12:45 today</div>
                </div>
                <StandingsTable/>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App/>
  </StrictMode>,
);
