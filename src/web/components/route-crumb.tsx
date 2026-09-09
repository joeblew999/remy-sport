import { useLocale } from "../lib/locale";
import { m } from "../lib/i18n";
import { routeHref, type Route } from "../lib/router";
import { useEvent, useOrg, usePlayer, useTeam } from "../lib/data";
import { BreadcrumbLink } from "@/components/ui/breadcrumb";

/**
 * One step back, naming itself from the route it points at.
 *
 * The trail is carried in the URL as routes, not as labels — see `here` in
 * lib/router.tsx. Labels are resolved here instead of being written into the
 * link for two reasons. A name in a URL goes stale the moment somebody renames
 * the team, and it makes a shared link twice as long for something the app
 * already knows.
 *
 * A component per crumb rather than a loop in the header, because each one
 * needs its own hooks and hooks cannot run in a loop. The queries below are the
 * same ones the origin page just used, so the answer is already in the cache
 * and the crumb renders with its name immediately; only a cold shared link
 * pays a fetch.
 *
 * Nothing renders until the name is known. A crumb reading "Team" for a moment
 * and then the team's name is a layout that jumps in the one row that must not.
 */
export function RouteCrumb({ route }: { route: Route }) {
  const { name } = useLocale();
  const id = route.id;

  // One of these is enabled; the rest are asked for `undefined` and idle.
  const event = useEvent(route.page === "event" || route.page === "game" ? id : undefined);
  const team = useTeam(route.page === "team" ? id : undefined);
  const org = useOrg(route.page === "org" ? id : undefined);
  const player = usePlayer(route.page === "player" ? id : undefined);

  const label = (() => {
    switch (route.page) {
      // The pages the sidebar goes to say their own name; there is nothing to
      // fetch and nothing that can be stale.
      case "home": return m.home_crumb();
      case "discover": return m.nav_discover();
      case "live": return m.nav_live();
      case "teams": return m.nav_teams();
      case "orgs": return m.nav_orgs();
      case "profile": return m.profile_crumb();
      case "admin": return m.admin_crumb();
      case "event": return event.data?.title;
      case "team": return team.data?.name;
      case "org": return org.data?.name;
      case "player": return player.data ? name(player.data.names) : undefined;
      // A game, a broadcast and a watch page have no short name of their own
      // worth a crumb — you go back past them, not to them.
      default: return undefined;
    }
  })();

  if (!label) return null;
  return <BreadcrumbLink href={routeHref(route, { trail: true })} data-testid={`crumb-${route.page}`}>{label}</BreadcrumbLink>;
}
