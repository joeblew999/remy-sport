import { Icon } from "./icon";
import { Account } from "./account";
import type { Route } from "../lib/router";
import { useLocale } from "../lib/locale";

interface Props {
  spoiler: boolean;
  setSpoiler: (fn: boolean | ((prev: boolean) => boolean)) => void;
  onMenu?: () => void;
  goto: (r: Route) => void;
}

export function Topbar({ spoiler, setSpoiler, onMenu, goto }: Props) {
  const { locale, setLocale, available } = useLocale();
  return (
    <header className="topbar">
      {onMenu && (
        <button className="menu-btn" aria-label="Menu" onClick={onMenu}>
          <span></span><span></span><span></span>
        </button>
      )}
      <div className="search">
        <span style={{ color: "var(--ink-3)" }}><Icon name="search"/></span>
        <input placeholder="Search events, teams, players…"/>
        <span className="kbd">⌘K</span>
      </div>
      {/* One button per declared locale. A third language appears here by
          being in the fixtures — there is nothing to add. */}
      <div className="lang-switch">
        {available.map(l => (
          <button
            key={l.code}
            className={locale === l.code ? "active" : ""}
            title={l.nameEn}
            onClick={() => setLocale(l.code)}
          >
            {l.code.toUpperCase()}
          </button>
        ))}
      </div>
      <button className="icon-btn" title="Spoiler mode" onClick={() => setSpoiler(s => !s)}>
        <Icon name={spoiler ? "eyeoff" : "eye"} />
      </button>
      <button className="icon-btn"><Icon name="bell" /><span className="badge"></span></button>
      <button className="install-btn"><Icon name="download"/>Install app</button>
      <Account goto={goto}/>
    </header>
  );
}
