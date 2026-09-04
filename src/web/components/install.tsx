import { useEffect, useState } from "react";
import { m } from "../lib/i18n";
import { canInstall, needsManualSteps, onInstallChange, promptInstall } from "../lib/install";

/**
 * @answers INSTALL_APP
 *
 * "Install app", offered only where it means something.
 *
 * The old comment in topbar.tsx argued against a button in the chrome: "always
 * visible, correct only sometimes, and unable to tell whether the app is
 * already installed". Every part of that was true of a button that guessed.
 * This one asks — `canInstall()` is false when the app is already running
 * standalone, and false in a browser that has not offered.
 *
 * The alternative was the component prompting on arrival, which is worse than
 * either: it put a dialog over the app before the reader had seen anything
 * worth installing, and made the page unclickable underneath. See
 * src/web/lib/install.ts.
 *
 * ## iOS gets sentences, because it gets no API
 *
 * Safari fires no `beforeinstallprompt` and exposes nothing to call — a
 * deliberate platform decision, not a gap. So the only honest thing is to say
 * where the button is. Three lines, in three languages, next to every other
 * string in this app rather than inside a dependency that does not speak Thai.
 */
export function InstallApp() {
  const [offer, setOffer] = useState(false);
  const [steps, setSteps] = useState(false);

  useEffect(() => {
    const sync = () => setOffer(canInstall());
    sync();
    return onInstallChange(sync);
  }, []);

  if (!offer) return null;

  return (
    <>
      <button
        className="btn"
        data-testid="install-app"
        onClick={async () => {
          // False means there is no event to use — iOS, or a browser that never
          // fired one — so the steps are the answer rather than a dead button.
          if (!(await promptInstall())) setSteps(true);
        }}
      >
        {m.install_app()}
      </button>

      {steps && needsManualSteps() && (
        <div className="dash-card" data-testid="install-steps">
          <div className="push-note">{m.install_ios_steps()}</div>
          <button className="btn" data-testid="install-steps-dismiss" onClick={() => setSteps(false)}>
            {m.close()}
          </button>
        </div>
      )}
    </>
  );
}
