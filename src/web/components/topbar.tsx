import { PanelLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { Account } from "./account";
import { m } from "../lib/i18n";
import { Separator } from "@/components/ui/separator";
import { Muted, usePageTitle } from "./page"

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
 * One row, one layout, at every size: 56px, which is the mobile plan's
 * number and the one the topbar overflow check holds us to. The `topbar`
 * class is the hook for the stylesheet's one exception to the 44px control
 * height — chrome keeps the registry's compact size.
 *
 * No search box: it had a placeholder, a ⌘K hint and no handler of any kind.
 * It comes back as the registry's Command when there is something to search.
 * No bell: it carried an unread dot over a notifications feature that does
 * not exist. No "Install app": the account dropdown offers it only while the
 * install element says it can be done.
 */

/**
 * The brand. A proper noun in two scripts is not a string to translate — the
 * copy check's allowlist says the same. Shrinkable with an ellipsis rather
 * than fixed: the row must fit at 320px while the webfont is still loading.
 */
function Brand() {
  return (
    <div className="flex min-w-0 items-center gap-2.5" data-testid="brand">
      <span className="size-7 shrink-0 rounded-full bg-primary" aria-hidden="true" />
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-base font-semibold tracking-tight">Remy Sport</span>
        <Muted as="span" className="text-xs block truncate font-thai">เรมีสปอร์ต</Muted>
      </span>
    </div>
  );
}

/**
 * The site header, in `dashboard-01`'s shape.
 *
 * The block draws: trigger, a vertical separator, then the page's name as
 * `<h1 class="text-base font-medium">`. That is adopted here — the title used
 * to be a `text-2xl/3xl` band of its own below this bar, which is the single
 * biggest way the app's page architecture differed from the preset's.
 *
 * Two things stay ours and say why. The trigger is our own button, because the
 * registry's `SidebarTrigger` carries a hardcoded English screen-reader label
 * and the rule is never to mount a registry component that ships a word. And
 * the height is 56px through the block's own `--header-height` variable rather
 * than the block's 48px: 56 is the mobile plan's number, a phone decision with
 * a check behind it. The mechanism is the block's; only the value is ours.
 */
export function Topbar() {
  const { toggleSidebar } = useSidebar();
  const title = usePageTitle();
  return (
    <header className="topbar flex h-(--header-height) shrink-0 items-center gap-2 border-b bg-background px-3 lg:px-4">
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
      {title && (
        <>
          <Separator orientation="vertical" className="mx-1 h-4 shrink-0 data-vertical:self-auto" />
          {/* The page's one `h1`, where the block puts it. `min-w-0` and the
              truncate keep a long event name from pushing the account off a
              320px row — the thing the whole bar is measured against. */}
          <h1 className="min-w-0 truncate font-heading text-base font-medium" data-testid="page-title">
            {title}
          </h1>
        </>
      )}
      <div className="flex-1" />
      <Account />
    </header>
  );
}
