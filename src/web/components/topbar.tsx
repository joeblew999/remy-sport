import { Icon } from "./icon";
import { Account } from "./account";
import type { Route } from "../lib/router";
import { useLocale } from "../lib/locale";
import { m } from "../lib/i18n";

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
        <button className="menu-btn" aria-label={m.menu()} onClick={onMenu}>
          <span></span><span></span><span></span>
        </button>
      )}
      {/* The search box is gone, and it is the one worth explaining. It had a
          placeholder, a ⌘K hint and no handler of any kind: you could type into
          it and nothing would ever happen. A control that invites input and
          discards it is worse than an absent one, and it was the most
          prominent thing in the chrome.

          It comes back when there is something to search. `search_placeholder`
          and the `.search` styles are kept for that. */}
      <div className="topbar-spacer" />
      {/* One button per declared locale. A third language appears here by
          being in the fixtures — there is nothing to add. */}
      <div className="lang-switch">
        {available.map(code => (
          <button
            key={code}
            className={locale === code ? "active" : ""}
            onClick={() => setLocale(code)}
          >
            {code.toUpperCase()}
          </button>
        ))}
      </div>
      <button className="icon-btn" title={m.spoiler_mode()} onClick={() => setSpoiler(s => !s)}>
        <Icon name={spoiler ? "eyeoff" : "eye"} />
      </button>
      {/* No bell: it carried an unread dot over a notifications feature that
          does not exist. The model has `user_notification_channels` and
          `user_notification_preferences`, so this is buildable — it is not built.

          No "Install app" either, but the reason is no longer the one that used
          to be written here — that there was no manifest and no service worker.
          Both have shipped since, and main.tsx now renders <pwa-install>, which
          asks at the moment the browser says installing is possible. A button
          in the chrome would be a second, worse answer: always visible, correct
          only sometimes, and unable to tell whether the app is already
          installed. */}
      <Account goto={goto}/>
    </header>
  );
}
