import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { CompassIcon, DownloadIcon, HomeIcon, MoonIcon, RadioIcon, SchoolIcon, SunIcon, UserIcon, UsersIcon, VideoIcon, XIcon, type LucideIcon } from "lucide-react";
import { BuildStamp } from "./build-stamp";
import { isNativeApp } from "../lib/push";
import type { PwaInstall } from "../lib/installable";
import type { ComponentProps } from "react";
import { useSession } from "../lib/session";
import { directionOf, useLocale, type Locale } from "../lib/locale";
import { LOCALE } from "../../domain/vocabularies";
import { useTheme } from "../lib/theme-provider";
import { m } from "../lib/i18n";
import { routeHref, type Page } from "../lib/router";
import { Muted } from "./page"
import { Label } from "@/components/ui/label";

/**
 * The shell's navigation, on the registry's Sidebar (B2 step 8).
 *
 * What the old `sidebar.tsx` did and what happened to it:
 *
 * - **Navigation** (You / Browse) — here, as SidebarGroups. Same two groups,
 *   same rule about which is which; see the old file's account of it.
 * - **The brand** — moved to the topbar, which is where identity lives now,
 *   so the sidebar begins with navigation and says so on a phone too.
 * - **The user card** — deleted. It showed the same person the topbar shows,
 *   twice on every screen, and did nothing; the dropdown on the topbar avatar
 *   holds the person and the account chores in one place now.
 * - **Settings** — new here, and the reason the topbar shrank: the language
 *   switch is a ToggleGroup and the spoiler a labelled Switch, in a Settings
 *   group, per the plan. On a phone the sidebar is a Sheet, so these live
 *   behind the menu button at every size — which is the one-layout rule.
 * - **The build stamp** — stays at the bottom, hidden while collapsed to
 *   icons, where a hash has no room to mean anything.
 *
 * `collapsible="icon"` is the collapse the plan asked for: to a rail of
 * icons, never offcanvas on desktop. Under 768px the registry component
 * becomes a Sheet by itself, which replaces `.nav-backdrop` and the
 * `nav-open` state in `main.tsx` outright.
 *
 * Language and dates do not move: every label here is a message call, built
 * per render — a message is a call, not a constant, and module scope is how
 * the old sidebar froze into English on a Thai page.
 */

/** A language in its own name, from the model. Falls back to the code so a
 *  language declared without one is visible rather than blank. */
const endonymOf = (code: string) => LOCALE.find((l) => l.code === code)?.endonym ?? code.toUpperCase();

interface NavItem {
  id: Page;
  label: string;
  icon: LucideIcon;
}

/** What is yours, offered only to somebody signed in. */
const YOU = (): NavItem[] => [
  { id: "home", label: m.nav_home(), icon: HomeIcon },
  { id: "profile", label: m.nav_profile(), icon: UserIcon },
  // Under You rather than Browse: a meeting is a thing you are in, not
  // something you look through. docs/2026-09-09-13-meetings.md.
  { id: "meetings", label: m.meetings(), icon: VideoIcon },
];

/** The platform: what is on, what is live, every team, every school. */
const BROWSE = (): NavItem[] => [
  { id: "discover", label: m.nav_discover(), icon: CompassIcon },
  { id: "live", label: m.nav_live(), icon: RadioIcon },
  { id: "teams", label: m.nav_teams(), icon: UsersIcon },
  { id: "orgs", label: m.nav_orgs(), icon: SchoolIcon },
];

/**
 * One nav row. A link, because navigation goes somewhere: middle-click and
 * the browser's own link behaviours keep working, the way `.nav-item` had it.
 *
 * The drawer closes on navigate (`setOpenMobile(false)`) — on a phone the
 * sidebar is a Sheet, and a link that leaves the sheet open over the page it
 * opened is the bug the old `onNavigate` prop existed for.
 */
function NavRow({ item, active }: { item: NavItem; active: boolean }) {
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={
          <a
            href={routeHref({ page: item.id })}
            aria-current={active ? "page" : undefined}
            data-testid={`nav-${item.id}`}
            onClick={() => setOpenMobile(false)}
          />
        }
        isActive={active}
        tooltip={item.label}
      >
        <item.icon />
        <span>{item.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/**
 * The settings that used to squat in the topbar. Hidden entirely while the
 * sidebar is collapsed to icons: a switch and a segmented control do not
 * collapse to a rail, and the collapsed state is for reading, not changing.
 *
 * @answers SPOILER_MODE
 */
function SettingsGroup({ spoiler, onSpoilerChange }: {
  spoiler: boolean;
  onSpoilerChange: (spoiler: boolean) => void;
}) {
  const { locale, setLocale, available } = useLocale();
  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>{m.settings()}</SidebarGroupLabel>
      <SidebarGroupContent>
        <div className="flex flex-col gap-3 px-2 py-1">
          <ThemeRow />
          <div className="flex items-center justify-between gap-2">
            <Muted as="span">{m.language()}</Muted>
            {/*
              The registry's Select, because this row has to survive fifteen
              languages and a ToggleGroup of two-letter codes does not: PT beside
              PL, FA beside FI, wrapping over four lines, and the name a reader
              actually scans for never shown at all.

              Each language is named in its own — `endonym` on the model — so
              somebody who cannot read the current interface can still find
              theirs. Not NativeSelect, whose options the operating system draws,
              so the stylesheet's font tail cannot reach them and an endonym is
              exactly where tofu appears.
              docs/done/2026-09-09-15-language-picker-at-fifteen.md.
            */}
            <Select
              value={locale ?? ""}
              onValueChange={(next: unknown) => {
                // A language is not a toggle you can switch off; an empty
                // choice means the open menu was dismissed, and it stays.
                if (typeof next === "string" && next) setLocale(next as Locale);
              }}
            >
              <SelectTrigger size="sm" className="w-auto min-w-28" data-testid="lang-switch" aria-label={m.language()}>
                {/* Base UI renders the raw value unless told otherwise, so the
                    trigger said "en" while the list said "English". The trigger
                    is the one place a reader who cannot read the interface looks
                    to see what it is set to, so it says the endonym too. */}
                <SelectValue>{(code: unknown) => endonymOf(String(code))}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {available.map((code) => (
                  <SelectItem key={code} value={code} data-testid={`lang-${code}`}>
                    {endonymOf(code)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Label className="flex items-center justify-between gap-2 text-sm">
            <span>{m.spoiler_mode()}</span>
            <Switch
              size="sm"
              checked={spoiler}
              data-testid="spoiler-switch"
              aria-label={m.spoiler_mode()}
              onCheckedChange={(checked) => onSpoilerChange(checked === true)}
            />
          </Label>
          <InstallRow />
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

/**
 * Install app, back in the GUI at the Product Owner's ask (2026-09-08).
 *
 * @answers INSTALL_APP
 *
 * Always offered in a browser that is not already running the installed app:
 * `showDialog(true)` is the element's forced dialog, which shows the
 * platform's own install steps whether or not the browser has fired its
 * install prompt yet — so the button always does something true. Not inside
 * Tauri, where main.tsx renders no element and the reader has the native app.
 */
function InstallRow() {
  if (isNativeApp()) return null;
  if (typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches) return null;
  return (
    <div className="flex items-center justify-between gap-2">
      <Muted as="span">{m.install_app()}</Muted>
      <Button
        variant="outline"
        size="sm"
        data-testid="install-app"
        onClick={() => (document.getElementById("pwa-install") as PwaInstall | null)?.showDialog?.(true)}
      >
        <DownloadIcon data-icon="inline-start" />
        {m.install_app()}
      </Button>
    </div>
  );
}

/**
 * Light and dark, mounted here per the plan. A dropdown rather than a third
 * row of controls: three choices behind one label, and the icon states the
 * current resolution at a glance.
 */
function ThemeRow() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const label = theme === "system" ? m.theme_system() : theme === "dark" ? m.theme_dark() : m.theme_light();
  return (
    <div className="flex items-center justify-between gap-2">
      <Muted as="span">{m.theme()}</Muted>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="outline" size="sm" data-testid="theme-switch" aria-label={label} />}
        >
          {resolvedTheme === "dark" ? <MoonIcon /> : <SunIcon />}
          <span>{label}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" data-testid="theme-menu">
          <DropdownMenuItem data-testid="theme-light" onClick={() => setTheme("light")}>
            {m.theme_light()}
          </DropdownMenuItem>
          <DropdownMenuItem data-testid="theme-dark" onClick={() => setTheme("dark")}>
            {m.theme_dark()}
          </DropdownMenuItem>
          <DropdownMenuItem data-testid="theme-system" onClick={() => setTheme("system")}>
            {m.theme_system()}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function AppSidebar({ page, spoiler, onSpoilerChange, variant }: {
  page: Page;
  spoiler: boolean;
  onSpoilerChange: (spoiler: boolean) => void;
  /** `inset` is the block's: a floating, rounded, shadowed panel. */
  variant?: ComponentProps<typeof Sidebar>["variant"];
}) {
  const { user } = useSession();
  const { locale } = useLocale();
  const { isMobile, openMobile, setOpenMobile } = useSidebar();
  const group = (title: string, items: NavItem[]) => (
    <SidebarGroup>
      <SidebarGroupLabel>{title}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((it) => (
            <NavRow key={it.id} item={it} active={page === it.id} />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
  const content = (
    <>
      <SidebarContent>
        {user && group(m.nav_you(), YOU())}
        {group(m.browse(), BROWSE())}
        <SettingsGroup spoiler={spoiler} onSpoilerChange={onSpoilerChange} />
      </SidebarContent>
      <SidebarFooter className="group-data-[collapsible=icon]:hidden">
        <BuildStamp />
      </SidebarFooter>
    </>
  );

  /**
   * Under 768px, our own Sheet rather than the registry Sidebar's built-in
   * one. The built-in Sheet announces itself to screen readers in hardcoded
   * English ("Sidebar", "Displays the mobile sidebar.", "Close"), inside the
   * locked file, where the rule is never to edit — so the registry's Sheet is
   * driven from here with our messages instead, on the same `openMobile`
   * state the menu button toggles. Same content, same width, same side.
   */
  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetContent
          side="left"
          showCloseButton={false}
          data-slot="sidebar"
          data-mobile="true"
          className="w-72 bg-sidebar p-0 text-sidebar-foreground"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{m.menu()}</SheetTitle>
            <SheetDescription>{m.menu_sheet()}</SheetDescription>
          </SheetHeader>
          <SheetClose
            render={<Button variant="ghost" size="icon-sm" className="absolute top-3 right-3" aria-label={m.dismiss()} data-testid="menu-close" />}
          >
            <XIcon />
          </SheetClose>
          <div className="flex h-full w-full flex-col">{content}</div>
        </SheetContent>
      </Sheet>
    );
  }

  /**
   * The drawer changes sides in a right-to-left language.
   *
   * The registry's Sidebar positions itself physically — `left-0` / `right-0`
   * keyed off `data-side` — and defaults to the left, so `dir="rtl"` alone
   * mirrors the text inside it and leaves the panel where it was. In Arabic the
   * navigation belongs on the right, which is where the reader's eye starts.
   *
   * `side` is the registry's own prop, so this is choosing between the two
   * behaviours it already ships rather than overriding its CSS.
   */
  return (
    <Sidebar collapsible="icon" variant={variant} side={directionOf(locale) === "rtl" ? "right" : "left"}>
      {content}
    </Sidebar>
  );
}
