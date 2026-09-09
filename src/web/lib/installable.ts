/**
 * Whether this browser can install the app, asked of `<pwa-install>`.
 *
 * ## Why every answer arrives late
 *
 * The component decides on its own schedule, and every one of its paths is
 * later than a page load: on Apple 500ms after `window.load`; on Chromium not
 * until the browser fires `beforeinstallprompt`, which is after load and behind
 * its own engagement heuristics; on Android without that event a second after
 * it initialises, or up to thirty seconds while it watches
 * `navigator.userActivation`. The element does not even exist until its lazy
 * chunk has upgraded it (see the import at the foot of main.tsx), so a property
 * read before then is `undefined` on an element that has not run.
 *
 * This used to be a single read on a 1000ms timer inside the component that
 * renders the offer. It was earlier than all of the above, and the offer mounts
 * once — in the topbar, which the shell keeps across routes — so the one miss
 * was the whole session and the install item never appeared at all.
 *
 * `pwa-install-available-event` is what the component raises at each of those
 * moments. It is listened for on the element rather than the document because
 * it does not bubble, and subscribing before the chunk arrives is safe:
 * listeners survive a custom element upgrade.
 *
 * ## Why this is a module and not eight lines in an effect
 *
 * Because no browser tier here can hold it. Playwright's WebKit presents as
 * macOS Safari, so the component decides "installable" by itself 500ms after
 * load — measured — and a render spec passes whether or not anything is
 * listening, including against the broken version this replaces. The unit tier
 * can drive it with a fake element and no DOM library, which is the only place
 * the wiring is actually pinned.
 */

/**
 * As much of the element as this file asks about.
 *
 * Every field is optional because all of them are absent until the lazy chunk
 * upgrades the element — optional rather than a cast that would let the code
 * pretend otherwise.
 */
export type PwaInstall = EventTarget & {
  isInstallAvailable?: boolean;
  isUnderStandaloneMode?: boolean;
  showDialog?: (forced?: boolean) => void;
};

/**
 * A persistent "this origin has the app installed" flag.
 *
 * `getInstalledRelatedApps()` is the authoritative signal but it is
 * Chromium-only and returns nothing on localhost — measured — so it cannot be
 * the only word. The native `appinstalled` event fires only at install time,
 * not on a later load, so a reader who installed the app and then refreshed
 * the browser tab would see the offer again. Writing a flag when the app is
 * installed and reading it on load closes that gap: the offer stays gone
 * across refreshes, on every browser that has storage. Guarded with try/catch
 * because the unit tier runs in node, where there is no `localStorage`.
 */
const INSTALLED_KEY = "remy-pwa-installed";
function markInstalled() {
  try {
    localStorage.setItem(INSTALLED_KEY, "1");
  } catch {
    /* no storage — the in-memory report still holds for this session */
  }
}
function wasInstalled() {
  try {
    return localStorage.getItem(INSTALLED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Report whether installing is on offer — now, and whenever that changes.
 *
 * Returns the unsubscribe, so an effect can hand it back directly.
 */
export function watchInstallable(
  el: PwaInstall | null,
  report: (installable: boolean) => void,
): () => void {
  // Nothing to ask inside Tauri, where main.tsx renders no element: the reader
  // already has the native app. Reporting `false` here would be a second way of
  // saying the same thing the initial state already says.
  if (!el) return () => {};

  /**
   * Whether this origin already has the app installed. Once true it never goes
   * back, and every later signal must respect it — in particular the
   * component's `pwa-install-available-event`, which the browser can raise
   * again after an install and which would otherwise re-show the offer.
   */
  let installed = wasInstalled();

  const reportState = (available: boolean) => report(!installed && available && !el.isUnderStandaloneMode);

  // The already-decided case — a reader whose browser made its mind up before
  // this ran, which is the only case the old property read ever caught. A
  // reader who installed the app on a previous visit is already decided too.
  reportState(Boolean(el.isInstallAvailable));

  /**
   * The event is the answer, not a hint to go and re-read one.
   *
   * The component sets `isInstallAvailable = true` immediately before every
   * dispatch, so the two say the same thing — but taking the event at its word
   * is what makes the offer testable. A handler that re-read the property could
   * be satisfied by any later read of a property a test had set, which is how
   * the first attempt at a regression test passed against the broken code it
   * was written to catch.
   */
  const onAvailable = () => reportState(true);
  // And installed: nothing left to offer. The component clears its own flag on
  // `appinstalled` before raising this, and an "Install app" item that outlives
  // the install is the same dishonest button reached the other way. The flag is
  // written so the offer stays gone after a refresh.
  const onInstalled = () => {
    installed = true;
    markInstalled();
    report(false);
  };
  // The component's own word that the reader accepted the install dialog. This
  // fires even where the native `appinstalled` event is unreliable (localhost),
  // so it is the most dependable signal that the app is being installed.
  const onUserChoice = (e: Event) => {
    if ((e as CustomEvent<string>).detail === "accepted") {
      installed = true;
      markInstalled();
      report(false);
    }
  };

  el.addEventListener("pwa-install-available-event", onAvailable);
  el.addEventListener("pwa-install-success-event", onInstalled);
  el.addEventListener("pwa-user-choice-result-event", onUserChoice);

  /**
   * The browser's own word that the app is installed.
   *
   * The component's `pwa-install-success-event` is not the only way to learn
   * this — it is itself raised from the native `appinstalled` event, so hearing
   * the native event directly cannot be lost to the component's timing. A
   * reader who installs the app in another tab, or whose browser already has
   * it, gets no offer. Guarded on `window` because the unit tier runs in node.
   */
  const onAppInstalled = () => {
    installed = true;
    markInstalled();
    report(false);
  };
  if (typeof window !== "undefined") window.addEventListener("appinstalled", onAppInstalled);

  /**
   * A returning visitor whose browser already has the app installed gets no
   * offer on load. `getInstalledRelatedApps` is Chromium-only and async; when
   * it is absent, the component's own signals and the persistent flag are the
   * only word.
   */
  let cancelled = false;
  const getInstalled = (
    navigator as Navigator & { getInstalledRelatedApps?: () => Promise<{ url?: string; id?: string }[]> }
  ).getInstalledRelatedApps;
  if (typeof getInstalled === "function") {
    void getInstalled()
      .then((apps) => {
        if (cancelled) return;
        const origin = window.location.origin;
        if (apps.some((a) => (a.url ?? "").startsWith(origin) || a.id === "/")) {
          installed = true;
          markInstalled();
          report(false);
        }
      })
      .catch(() => {});
  }

  return () => {
    cancelled = true;
    el.removeEventListener("pwa-install-available-event", onAvailable);
    el.removeEventListener("pwa-install-success-event", onInstalled);
    el.removeEventListener("pwa-user-choice-result-event", onUserChoice);
    if (typeof window !== "undefined") window.removeEventListener("appinstalled", onAppInstalled);
  };
}
