import { useAllGames, useMine } from "../lib/data";
import { useLocale } from "../lib/locale";
import { formatDayShort } from "../lib/dates";
import type { Route } from "../lib/router";
import { m } from "../lib/i18n";

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
export function YourGames({ goto }: { goto: (r: Route) => void }) {
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
    <>
      <div className="section-h">
        <h2>{m.your_games()}</h2>
      </div>
      <div className="dash-card" data-testid="your-games">
        {games.length === 0 ? (
          <div className="empty" data-testid="your-games-none">
            {m.home_no_upcoming_games()}
          </div>
        ) : (
          games.map((g) => {
            const live = isLive(g);
            return (
              <button
                key={g.id}
                className="row-button"
                data-testid={`your-game-${g.id}`}
                // A live game opens the court; an upcoming one opens the event
                // it belongs to, which is where its court and time are.
                onClick={() =>
                  goto(live ? { page: "watch", id: g.id } : { page: "event", id: g.eventId })
                }
              >
                <div className="row-title">
                  {g.homeTeam} {m.versus()} {g.awayTeam}
                </div>
                <div className="row-meta">
                  {live ? g.statusLabel : formatDayShort(locale, new Date(g.startsAt))}
                  {g.venue ? ` · ${g.venue}` : ""}
                </div>
              </button>
            );
          })
        )}
      </div>
    </>
  );
}
