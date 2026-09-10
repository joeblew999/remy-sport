import { ArrowLeftIcon } from "lucide-react";
import { ButtonLink } from "./button-link";
import { ancestorsOf, routeHref, type Page, type Route } from "../lib/router";
import { m } from "../lib/i18n";

/**
 * The way out, on a surface that has no browser Back.
 *
 * Installing removes the browser's chrome, and the product is installed on
 * Android, iOS, Windows and Mac — with a Tauri app for Windows and Mac
 * intended, whose window has no chrome and no system back either. Android
 * supplies a system Back; iOS offers only an undiscoverable edge swipe; a Tauri
 * window offers nothing. So on most of the surfaces this ships to, the
 * application is the only thing that can provide a way back, and until now it
 * provided none: the crumbs fold away below `sm`, and the return trail existed
 * only as a URL parameter that a few pages read.
 *
 * **Not `history.back()`.** `setParam` writes a history entry for every tab and
 * filter change, so the browser's Back undoes one chip at a time — correct for
 * the browser, and wrong for this control, which would appear to do nothing on
 * the page you are already looking at. This returns to the previous *screen*.
 *
 * **Not the destination's name, either.** `RouteCrumb` renders nothing until it
 * has resolved a label, which is right for a trail and wrong for an escape
 * hatch: a reader on a page that is loading, failing, or showing a missing
 * record is exactly the reader who needs the way out, and they need it
 * immediately. So the control is an arrow and one word, available before any
 * query answers.
 *
 * docs/2026-09-09-10-installed-app-back-navigation.md.
 */

/**
 * Where a page goes when nothing carried a trail — a cold link, a bookmark, a
 * notification, a sidebar entry.
 *
 * Exhaustive over `Page` on purpose, and with no `default`: adding a route to
 * `PAGES` without deciding its exit becomes a type error rather than a screen a
 * reader gets stranded on. That is the same reason the crumb ladder is checked
 * rather than remembered — see tests/repo/navigation.test.ts.
 *
 * These are the destinations the app's own not-found states already offer,
 * except a team's, which pointed at Discover although a team's parent is Teams.
 */
const PARENT: Record<Page, Page | null> = {
  home: null,
  discover: "home",
  live: "home",
  teams: "home",
  orgs: "home",
  profile: "home",
  devices: "home",
  notifications: "home",
  meetings: "home",
  admin: "home",
  login: "home",
  "meeting-test": "home",
  event: "discover",
  // A game, a broadcast and a watch page hang off what is playing rather than
  // off a directory; `live` is where the reader was looking.
  game: "live",
  broadcast: "live",
  watch: "live",
  team: "teams",
  player: "teams",
  org: "orgs",
  meeting: "meetings",
  "not-found": "home",
};

/** Where this route's Back should go, or null when there is nowhere above. */
export function backTarget(route: Route): Route | null {
  // The route actually taken wins over the hierarchy: a team reached from a
  // schedule goes back to that schedule, not to the directory. `ancestorsOf`
  // walks the nested `from=` trail, so this is the previous screen even when
  // several are stacked.
  const taken = ancestorsOf(route);
  const previous = taken[taken.length - 1];
  if (previous) return previous;

  const parent = PARENT[route.page];
  return parent ? { page: parent } : null;
}

/** The control itself, given a resolved target. Rendered by the shell. */
export function BackLink({ target }: { target: Route }) {
  return (
    <ButtonLink
      variant="ghost"
      // `size` is deliberately absent: ButtonLink holds every control to the
      // 44px touch height for a thumb at courtside, and an escape hatch on a
      // phone is the last control that should be smaller than that. `w-11`
      // squares it so the arrow reads as an icon button rather than a wide one.
      className="w-11 shrink-0 px-0"
      // `trail: true` so stepping back does not record the step back as another
      // place you came from, which would make Back oscillate between two pages.
      href={routeHref(target, { trail: true })}
      aria-label={m.back()}
      title={m.back()}
      data-testid="back"
    >
      <ArrowLeftIcon />
    </ButtonLink>
  );
}
