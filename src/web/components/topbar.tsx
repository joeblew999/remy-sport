import { Icon } from "./icon";
import type { Lang } from "../lib/i18n";

interface Props {
  lang: Lang;
  setLang: (l: Lang) => void;
  spoiler: boolean;
  setSpoiler: (fn: boolean | ((prev: boolean) => boolean)) => void;
  onMenu?: () => void;
}

export function Topbar({ lang, setLang, spoiler, setSpoiler, onMenu }: Props) {
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
      <div className="lang-switch">
        <button className={lang === "EN" ? "active" : ""} onClick={() => setLang("EN")}>EN</button>
        <button className={lang === "TH" ? "active" : ""} onClick={() => setLang("TH")}>TH</button>
      </div>
      <button className="icon-btn" title="Spoiler mode" onClick={() => setSpoiler(s => !s)}>
        <Icon name={spoiler ? "eyeoff" : "eye"} />
      </button>
      <button className="icon-btn"><Icon name="bell" /><span className="badge"></span></button>
      <button className="install-btn"><Icon name="download"/>Install app</button>
    </header>
  );
}
