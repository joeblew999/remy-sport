import { useSession, useSignOut } from "../lib/session";
import { parseRoute, signInRoute, routeHref } from "../lib/router";
import { m } from "../lib/i18n";
import { useCan } from "../lib/data";
import { useState, useEffect } from "react";
import { watchInstallable, type PwaInstall } from "../lib/installable";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Who you are, and how to stop being them.
 *
 * The SPA had a login *route* before this and nothing that linked to it, so
 * sign-in was reachable only by typing `#/login` into the address bar. The
 * tests navigated by URL and passed, which is exactly how a feature can be
 * fully covered and completely unusable at the same time.
 *
 * Lives in the topbar because that is where the account control sits in the
 * harness too — the two GUIs should not disagree about where "sign out" is.
 */
/**
 * Two letters for an avatar, from a name or an address.
 *
 * Exported because the sidebar shows the same person at the same time, and two
 * implementations of "who is signed in" is how they came to disagree — it used
 * to render a hardcoded "SK / Coach Sukasem" beside this component's real name.
 */
export function initialsFor(label: string): string {
  return label
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

/**
 * @answers SIGN_IN_OUT, INSTALL_APP
 *
 * The other half — signing out.
 *
 * The five buttons that used to sit beside the name (Install, Admin, Devices,
 * Sign out) are menu items now, inside one dropdown on the person. That is
 * B2 step 8's answer to the mobile plan's finding that a phone topbar carried
 * five account chores on every page and clipped Sign out for an admin: the
 * topbar shows who you are; the menu holds what you can do about it. The test
 * ids moved with the elements and say where they are now (`account-…`).
 */
export function Account() {
  const { user, loading } = useSession();
  const { data: canAdmin } = useCan("MANAGE_ALL_USERS");

  /**
   * Whether this browser can actually install the app, asked of the element.
   *
   * `<pwa-install>` knows three things a button cannot: whether the browser
   * fired `beforeinstallprompt`, whether the platform is one it can prompt on
   * at all, and whether the app is already installed and running standalone.
   * Asking it is what makes this offer honest rather than "always visible,
   * correct only sometimes" — which is the reason the old comment in topbar.tsx
   * gave for having no button, when the real answer was to ask.
   *
   * Asked once and then subscribed, because every answer arrives late. The
   * subscription lives in lib/installable.ts, where the unit tier can pin it;
   * that file carries the full account of why a single read on a timer — which
   * is what this was — never saw an answer at all.
   */
  const [installable, setInstallable] = useState(false);
  useEffect(
    () =>
      watchInstallable(
        document.getElementById("pwa-install") as PwaInstall | null,
        setInstallable,
      ),
    [],
  );
  const signOut = useSignOut();

  // Render nothing rather than a flash of "Sign in" that turns into a name a
  // moment later.
  if (loading) return <span className="account-slot" aria-busy="true" />;

  if (!user) {
    return (
      // `nativeButton={false}` because the entry point is a link — a route,
      // openable in a new tab like every other navigation — and Base UI's
      // button warns when its `render` is not a real <button>.
      <Button
        nativeButton={false}
        render={
          <a
            data-testid="topbar-sign-in"
            href={routeHref(signInRoute(parseRoute(window.location.hash)))}
          />
        }
      >
        {m.sign_in()}
      </Button>
    );
  }

  const label = user.name || user.email;
  const initials = initialsFor(label);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            data-testid="account"
            className="flex shrink-0 items-center gap-2 rounded-full py-1 pr-2 pl-1 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        }
      >
        <span className="account-ava" aria-hidden="true">{initials}</span>
        <span className="account-meta">
          <span className="account-name" data-testid="account-user">{label}</span>
          {/* The platform role, not an org role — the two are different things
              (ADR 009), and this is the one that decides what you may do. */}
          {user.role && <span className="account-role" data-testid="account-role">{user.role}</span>}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" data-testid="account-menu">
        <DropdownMenuItem
          render={<a data-testid="account-profile" href={routeHref({ page: "profile" })} />}
        >
          {m.nav_profile()}
        </DropdownMenuItem>
        <DropdownMenuItem
          render={<a data-testid="account-devices" href={routeHref({ page: "devices" })} />}
        >
          {m.devices()}
        </DropdownMenuItem>
        {/**
          * The way in to the admin console, which had none.
          *
          * `/#/admin` was reachable only by typing it. Nothing in the sidebar,
          * the topbar or any page linked to it — so the account list, the role
          * controls, approving a referee, deleting a team or a player and
          * creating an account were all built, enforced, and findable by somebody
          * who already knew the URL.
          *
          * Gated on the model's answer, not on `user.role === "admin"`. The
          * console itself asks `useCan("MANAGE_ALL_USERS")`, and a nav entry that
          * decided it differently is the second copy that keeps being the bug
          * here — a link to a page the API then refuses is a 403 with extra
          * steps.
          */}
        {canAdmin && (
          <DropdownMenuItem
            render={<a data-testid="account-admin" href={routeHref({ page: "admin" })} />}
          >
            {m.nav_admin()}
          </DropdownMenuItem>
        )}
        {/* Only where the element says installing is possible, and the app is not
            already installed. It prompted on arrival until a staging run could not
            click Sign out — see the note in main.tsx. */}
        {installable && (
          <DropdownMenuItem
            data-testid="account-install"
            onClick={() =>
              (document.getElementById("pwa-install") as PwaInstall | null)?.showDialog?.(true)
            }
          >
            {m.install_app()}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          data-testid="account-sign-out"
          onClick={() => signOut.mutate()}
        >
          {m.sign_out()}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
