import { PanelLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { ancestorsOf, useRouter } from "../lib/router";
import { RouteCrumb } from "./route-crumb";
import { BackLink, backTarget } from "./back-control";
import { Account } from "./account";
import { m } from "../lib/i18n";
import { Fragment } from "react";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
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
    <div className="flex min-w-0 shrink-0 items-center gap-2.5" data-testid="brand">
      <span className="size-7 shrink-0 rounded-full bg-primary" aria-hidden="true" />
      {/*
        The name in words, on a screen with room for it.

        The bar now carries the page's title as well, and at 390px the three of
        them — brand, title, account — each truncated the others to an initial:
        "R… | What's … | Thanakorn …". The page you are on is the more useful of
        the two, and the app's name is still in plain sight as the mark to the
        left and spelled out at the top of the sidebar the menu button opens.
        This is also where `dashboard-01` puts the brand: in the sidebar, with
        the header carrying only the trigger and the title.
      */}
      <span className="hidden min-w-0 leading-tight sm:block">
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
  const trail = usePageTitle();
  const { route } = useRouter();
  const taken = ancestorsOf(route);
  /**
   * At every width, on every surface — not behind `sm`.
   *
   * The crumbs below fold away on a phone, and that is a width decision. This
   * is not: installing removes the browser's Back on iOS entirely and in a
   * Tauri window entirely, and a Tauri window is 1280px wide. A return control
   * gated on screen size would be missing from the desktop app that has no
   * other way back. docs/2026-09-09-10-installed-app-back-navigation.md.
   */
  const back = backTarget(route);
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
      {back && <BackLink target={back} />}
      {trail && (
        <>
          <Separator orientation="vertical" className="mx-1 h-4 shrink-0 data-vertical:self-auto" />
          {/*
            One trail, in the bar: where you are, and every step back up.

            This is the block's own header pattern (`sidebar-07` puts the
            breadcrumb here, not in the page), and it is what makes drilling in
            consistent. Before 2026-09-09 a page's ancestors were a row in the
            content band on eleven screens, absent entirely on a team and a
            game — you could reach a team from the directory and the app gave
            you no way back — and Discover carried an unlinked "Home" that no
            other landing page had.

            The rule the pages now follow: `crumbs` are the **ancestors**, each
            one linked, and the page itself is the `h1` at the end. A top-level
            screen has no ancestors and is just the `h1`.

            The ancestors fold away below `sm`, as they do in the block: on a
            phone the row belongs to the page you are on, and the sidebar is
            the way back.
          */}
          <Breadcrumb aria-label={m.breadcrumbs()} className="min-w-0">
            <BreadcrumbList className="flex-nowrap">
              {/*
                The route taken wins over the hierarchy.

                `taken` is the chain this page was reached through, read out of
                the URL. When it is there it *replaces* the page's declared
                ancestors, because it is the more truthful answer to "how do I
                get back": a team reached from a schedule goes back to that
                schedule, not to the directory. When it is empty — a cold link,
                a bookmark, a sidebar entry — the page's own hierarchy is what
                is left, and it is still right.
              */}
              {taken.length > 0
                ? taken.map((r, i) => (
                    <Fragment key={i}>
                      <BreadcrumbItem className="hidden shrink-0 sm:inline-flex">
                        <RouteCrumb route={r} />
                      </BreadcrumbItem>
                      <BreadcrumbSeparator className="hidden sm:block" />
                    </Fragment>
                  ))
                : trail.crumbs.map((c, i) => (
                    <Fragment key={i}>
                      <BreadcrumbItem className="hidden shrink-0 sm:inline-flex">
                        {c.href ? (
                          <BreadcrumbLink href={c.href} data-testid={c.testId}>{c.label}</BreadcrumbLink>
                        ) : (
                          <span>{c.label}</span>
                        )}
                      </BreadcrumbItem>
                      <BreadcrumbSeparator className="hidden sm:block" />
                    </Fragment>
                  ))}
              <BreadcrumbItem className="min-w-0">
                <h1 className="min-w-0 truncate font-heading text-base font-medium text-foreground" data-testid="page-title">
                  {trail.title}
                </h1>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </>
      )}
      <div className="flex-1" />
      <Account />
    </header>
  );
}
