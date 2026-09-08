import { useAllGames, useMine } from "../lib/data";
import { useLocale } from "../lib/locale";
import { formatDayShort } from "../lib/dates";
import { routeHref } from "../lib/router";
import { m } from "../lib/i18n";
import { LinkRow, SectionHeading } from "./page";
import { EmptyState } from "./states";
import { ItemDescription, ItemGroup } from "@/components/ui/item";

/**
 * The games you are refereeing — the screen Adisorn never had.
 *
 * `GAME_REFEREE` holdings from `me.mine`, matched against the game list. Not
 * only the live ones: a referee opens the app to see what is *next*, and the
 * first version showed nothing on a quiet evening — fifteen assignments, "No
 * games assigned to you". Finished games are left out; the next few, live
 * first, are what an official needs.
 *
 * Renders nothing for everybody else. Most readers are not referees, and an
 * empty card explaining that is noise.
 */
export function YourGames() {
  const { locale } = useLocale();
  const { data: mine } = useMine("GAME");
  const { data } = useAllGames();
  const ids = new Set(mine.map((h) => h.id));
  const isLive = (g: { statusCode: string }) =>
    g.statusCode === "LIVE" || g.statusCode === "HALF_TIME";
  // Live first, then by kick-off: an official on court now needs that game at
  // the top whatever its scheduled time says.
  const games = (data?.games ?? [])
    .filter((g) => ids.has(g.id) && g.statusCode !== "FINISHED")
    .sort((a, b) => Number(isLive(b)) - Number(isLive(a)) || a.startsAt.localeCompare(b.startsAt))
    .slice(0, 6);

  if (mine.length === 0) return null;

  return (
    <section>
      <SectionHeading title={m.your_games()} className="mt-0" />
      <ItemGroup className="gap-0 divide-y overflow-hidden rounded-xl border" data-testid="your-games">
        {games.length === 0 ? (
          <EmptyState className="border-0" data-testid="your-games-none">{m.home_no_upcoming_games()}</EmptyState>
        ) : (
          games.map((g) => {
            const live = isLive(g);
            return (
              // Every assignment opens its game, including before tip-off.
              <LinkRow key={g.id} data-testid={`your-game-${g.id}`} href={routeHref({ page: "game", id: g.id })} title={<>{g.homeTeam} {m.versus()} {g.awayTeam}</>}>
                <ItemDescription>
                  {live ? g.statusLabel : formatDayShort(locale, new Date(g.startsAt))}
                  {g.venue ? ` · ${g.venue}` : ""}
                </ItemDescription>
              </LinkRow>
            );
          })
        )}
      </ItemGroup>
    </section>
  );
}
