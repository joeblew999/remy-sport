import { PanelLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { Account } from "./account";
import { m } from "../lib/i18n";

/**
 * The topbar is identity, the sidebar is navigation, account and settings.
 * That division is the mobile plan's rule, and this file is what is left of
 * the old chrome once it was applied (B2 step 8):
 *
 * - **Menu button** — ours, not the registry's `SidebarTrigger`, for one
 *   reason: the registry's carries a hardcoded English screen-reader label,
 *   and the plan's rule for that is never to mount it — render our own
 *   control with our message. It calls the same `toggleSidebar`.
 * - **Brand** — moved here from the sidebar, so the app says its name at
 *   every size, including a phone where the sidebar is folded away.
 * - **Language switch and spoiler eye** — gone to the sidebar's Settings
 *   group. Three permanent buttons and an unlabelled eye no longer sit on
 *   the most valuable row of a phone.
 * - **Account** — a Sign in button, or the person as one dropdown trigger.
 *   The old five button chores (Install, Admin, Devices, Sign out) live in
 *   that dropdown; see components/account.tsx.
 *
 * One row, one layout, at every size. Values may scale; placement never does.
 */

/**
 * The brand, verbatim from the old sidebar. A proper noun in two scripts is
 * not a string to translate — the copy check's allowlist says the same.
 */
function Brand() {
  return (
    <div className="brand">
      <div className="brand-mark"></div>
      <div className="brand-name">Remy Sport<span className="sub">เรมีสปอร์ต</span></div>
    </div>
  );
}

export function Topbar() {
  const { toggleSidebar } = useSidebar();
  return (
    <header className="topbar">
      <Button
        variant="ghost"
        size="icon"
        aria-label={m.menu()}
        data-testid="menu-btn"
        onClick={toggleSidebar}
      >
        <PanelLeftIcon />
      </Button>
      <Brand />
      {/* The search box is gone, and it is the one worth explaining. It had a
          placeholder, a ⌘K hint and no handler of any kind: you could type into
          it and nothing would ever happen. A control that invites input and
          discards it is worse than an absent one, and it was the most
          prominent thing in the chrome.

          It comes back when there is something to search. `search_placeholder`
          and the `.search` styles are kept for that. */}
      <div className="topbar-spacer" />
      {/* No bell: it carried an unread dot over a notifications feature that
          does not exist. The model has `user_notification_channels` and
          `user_notification_preferences`, so this is buildable — it is not built.

          No "Install app" either: main.tsx renders <pwa-install>, which asks at
          the moment the browser says installing is possible, and the account
          dropdown offers it only while the element says it can be done. A
          button in the chrome would be a second, worse answer: always visible,
          correct only sometimes, and unable to tell whether the app is already
          installed. */}
      <Account />
    </header>
  );
}
